import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shellSettled } from '@niscorp/nova';
import type { Shell } from '@niscorp/nova';
import { livenessOf } from '@niscorp/nova/reflect';
import type { NiscShellProject } from './project';

// ═══════════════════════════════════════════════════════════════
// AN APP WITH ITS OWN SHELL, DRAWN AHEAD OF TIME.
//
// The shell lives in the page. A build runs the app's own boot where there is
// no browser, waits for the screen to be whole, and has the app's adapter draw
// it to markup; the page's boot then picks that markup up and from there the
// app is what it always was. No server holds a shell at any point.
//
// A file is a claim — "this is the page" — so a build does not write one it has
// not checked. Per path, and each one FAILS the build:
//
//   drawn         the app booted and its screen drew to markup that is not empty
//   whole         nothing was still loading when it was drawn
//   same twice    a second boot draws the same markup, byte for byte — or the
//                 page's own boot would not match what the file says
//   adopted       inside a DOM, a third boot picks the markup up and the
//                 adapter complains about nothing
//
// And one that holds by construction: the boot is handed a path and nothing
// else, so a file is only ever the screen as nobody in particular sees it.
//
// What a build cannot fail on, it reports: what the screen opened with (those
// answers are in the markup as they were at build), what it can still call, and
// what it waits on.
// ═══════════════════════════════════════════════════════════════

const DEFAULT_BUILD_WAIT_MS = 5000;
export const DEFAULT_ROOT = '<div id="root"></div>';

export type ShellRouteReport = {
  path: string;
  // the whole document; the template as it is when the screen could not be drawn
  html: string;
  // every check that did not hold — empty is a file that may be written
  problems: readonly string[];
  // the actions on the first screen
  actions: readonly string[];
  // endpoints answered while the screen opened: their answers are in the markup
  // as they were when it was drawn
  opensWith: readonly string[];
  // endpoints the first screen can still call once it is in the page
  callsLater: readonly string[];
  // channels the first screen waits on
  listens: readonly string[];
};

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The screen, in the app's own index.html: inside the empty root, with whatever
// the kit would have put on <html>.
export const placeScreen = (template: string, screen: string, attributes: Record<string, string> = {}, root = DEFAULT_ROOT): string => {
  const written = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  return (
    template
      // functions, both, so nothing in the screen is read as a replacement pattern
      .replace(root, () => root.replace('></div>', () => `>${screen}</div>`))
      .replace(/<html([^>]*)>/, (whole, existing: string) => (written === '' ? whole : `<html${existing}${written}>`))
  );
};

// What the first screen is made of, read off the definitions of what is mounted.
const factsOf = (shell: Shell): Pick<ShellRouteReport, 'actions' | 'opensWith' | 'callsLater' | 'listens'> => {
  const [actions, opensWith, callsLater, listens] = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
  for (const canvas of Object.values(shell.getState().canvases)) {
    for (const instance of canvas.stack) {
      const definition = shell.getRuntime(instance.id)?.definition;
      if (definition === undefined) continue;
      actions.add(definition.id);
      const liveness = livenessOf(definition);
      for (const channel of liveness.listens) listens.add(channel);
      for (const endpoint of liveness.endpoints) {
        const label = `${definition.id}.${endpoint.name}${endpoint.kind === 'fn' ? ' (a function)' : endpoint.url !== undefined ? ` (${endpoint.url})` : ''}`;
        if (endpoint.onOpen) opensWith.add(label);
        if (endpoint.later) callsLater.add(label);
      }
    }
  }
  const sorted = (set: Set<string>): string[] => [...set].sort();
  return { actions: sorted(actions), opensWith: sorted(opensWith), callsLater: sorted(callsLater), listens: sorted(listens) };
};

type Drawn = { screen: string; whole: boolean; attributes: Record<string, string>; facts: ReturnType<typeof factsOf> };

// One boot, one draw, and the app let go again.
const drawOnce = async (project: NiscShellProject, path: string): Promise<Drawn> => {
  const booted = await project.shell({ path });
  try {
    const whole = await shellSettled(booted.shell, { waitMs: project.waitMs ?? DEFAULT_BUILD_WAIT_MS });
    const screen = await project.draw(booted.shell);
    return { screen, whole, attributes: project.htmlAttributes?.(booted.shell) ?? {}, facts: factsOf(booted.shell) };
  } finally {
    await booted.close?.();
  }
};

const said = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// ── adopted ──
//
// The one check that needs a browser's world. A DOM has to exist BEFORE the
// app's modules load (an adapter decides what it is running in when it is
// imported), so it runs in a process of its own: ./adopt stands a DOM up, loads
// the same config, and for each path puts the markup in a root and makes the
// app's own `adopt` call over a fresh boot.

type Adoption = { path: string; complaints: string[] };

const isAdoption = (value: unknown): value is Adoption =>
  value !== null &&
  typeof value === 'object' &&
  typeof Reflect.get(value, 'path') === 'string' &&
  Array.isArray(Reflect.get(value, 'complaints'));

const adoptAll = (root: string, pages: readonly { path: string; screen: string }[]): Adoption[] => {
  if (pages.length === 0) return [];
  const here = dirname(fileURLToPath(import.meta.url));
  // built: beside this file. From source (the package's own tests): in dist.
  const entry = [join(here, 'adopt.js'), join(here, '..', 'dist', 'adopt.js')].find((candidate) => existsSync(candidate));
  if (entry === undefined) throw new Error('nisc: the adoption check is not built (packages/cli/dist/adopt.js).');
  const scratch = mkdtempSync(join(tmpdir(), 'nisc-adopt-'));
  try {
    const [asked, answered] = [join(scratch, 'pages.json'), join(scratch, 'adopted.json')];
    writeFileSync(asked, JSON.stringify(pages));
    const result = spawnSync(process.execPath, [entry, root, asked, answered], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    if (!existsSync(answered)) {
      const why = result.stderr.trim().split('\n').slice(-6).join('\n');
      return pages.map((page) => ({ path: page.path, complaints: [`the adoption check could not run${why === '' ? '' : ` — ${why}`}`] }));
    }
    const parsed: unknown = JSON.parse(readFileSync(answered, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isAdoption) : [];
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

// Every path, checked.
export const surveyShell = async (root: string, project: NiscShellProject, template: string): Promise<ShellRouteReport[]> => {
  if (!template.includes(DEFAULT_ROOT)) {
    throw new Error(`nisc: the built index.html has no empty root (${DEFAULT_ROOT}) — that is where a screen goes.`);
  }
  const paths = project.paths === undefined ? ['/'] : await project.paths();
  const none = { actions: [], opensWith: [], callsLater: [], listens: [] };

  const first: { path: string; drawn?: Drawn; problems: string[] }[] = [];
  for (const path of paths) {
    const problems: string[] = [];
    let drawn: Drawn | undefined;
    try {
      drawn = await drawOnce(project, path);
      if (drawn.screen.trim() === '') problems.push('drawn: it drew to nothing');
      if (!drawn.whole) problems.push(`whole: it was still loading after ${project.waitMs ?? DEFAULT_BUILD_WAIT_MS}ms`);
      const again = await drawOnce(project, path);
      if (again.screen !== drawn.screen) problems.push(`same twice: a second boot drew different markup${differenceOf(drawn.screen, again.screen)}`);
    } catch (error) {
      problems.push(`drawn: ${said(error)}`);
    }
    first.push({ path, ...(drawn !== undefined ? { drawn } : {}), problems });
  }

  // only what is worth adopting: a screen that drew, whole
  const adoptable = first.flatMap((route) => (route.drawn !== undefined && route.drawn.whole && route.drawn.screen.trim() !== '' ? [{ path: route.path, screen: route.drawn.screen }] : []));
  const adoptions = new Map(adoptAll(root, adoptable).map((adoption) => [adoption.path, adoption.complaints]));

  return first.map((route) => {
    const asked = adoptable.some((page) => page.path === route.path);
    const complaints = asked ? (adoptions.get(route.path) ?? ['the adoption check said nothing about it']) : [];
    const problems = [...route.problems, ...complaints.map((complaint) => `adopted: ${complaint}`)];
    return {
      path: route.path,
      html: route.drawn === undefined ? template : placeScreen(template, route.drawn.screen, route.drawn.attributes),
      problems,
      ...(route.drawn?.facts ?? none),
    };
  });
};

// Where two draws part, in a few words — enough to find it.
const differenceOf = (a: string, b: string): string => {
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
  const around = (text: string): string => JSON.stringify(text.slice(Math.max(0, at - 30), at + 50));
  return ` — at character ${at}: ${around(a)} then ${around(b)}`;
};

const pad = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - text.length));

export const shellRouteTable = (routes: readonly ShellRouteReport[]): string => {
  const width = Math.max(5, ...routes.map((route) => route.path.length)) + 2;
  const lines = [`  ${pad('Route', width)}First screen`];
  const indent = ' '.repeat(width + 2);
  for (const route of routes) {
    const ok = route.problems.length === 0;
    const notes = ok
      ? [
          `drawn · whole · same twice · adopted${route.actions.length > 0 ? `   (${route.actions.join(', ')})` : ''}`,
          ...(route.opensWith.length > 0 ? [`opened with ${route.opensWith.join(', ')} — in the file as answered at build`] : []),
          ...(route.callsLater.length > 0 ? [`can still call ${route.callsLater.join(', ')}`] : []),
          ...(route.listens.length > 0 ? [`waits on ${route.listens.join(', ')}`] : []),
        ]
      : route.problems;
    const [head, ...rest] = notes;
    lines.push(`${ok ? '○' : '✗'} ${pad(route.path, width)}${head ?? ''}`);
    for (const note of rest) lines.push(`${indent}${note}`);
  }
  lines.push('');
  lines.push('○  a file: the first screen, drawn for nobody in particular; the page’s own shell picks it up');
  lines.push('✗  not written: a check did not hold');
  return lines.join('\n');
};

// ── served ──
//
// The same draw, per request: the first answer to a path is its screen, and
// everything else in the built folder is a file. No checks here — a build made
// them; a screen that will not draw goes out as the template, and the page's
// own boot paints it as it did before any of this existed.

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export const shellSite = (project: NiscShellProject, dist: string): ((request: Request) => Promise<Response>) => {
  const base = resolve(dist);
  return async (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path !== '/' && path !== '/index.html') {
      const file = resolve(base, `.${path}`);
      if ((file === base || file.startsWith(base + sep)) && existsSync(file) && statSync(file).isFile()) {
        return new Response(readFileSync(file), { headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' } });
      }
      // a name with an extension that is not there is a missing file, not a page
      if (extname(path) !== '') return new Response('not found', { status: 404 });
    }
    const template = readFileSync(join(base, 'index.html'), 'utf8');
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' };
    try {
      const drawn = await drawOnce(project, path === '/index.html' ? '/' : path);
      return new Response(placeScreen(template, drawn.screen, drawn.attributes), { headers });
    } catch (error) {
      console.error(`[nisc] "${path}" could not be drawn — serving it undrawn:`, error);
      return new Response(template, { headers });
    }
  };
};
