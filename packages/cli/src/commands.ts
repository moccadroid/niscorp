import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import type { ExportedDocument } from '@niscorp/moss';
import { devServer } from './dev';
import { isShellProject, loadProject } from './project';
import type { NiscMossProject, NiscProject, NiscShellProject } from './project';
import { defaultPaths, fileOf, routeTable } from './routes';
import { shellRouteTable, shellSite, surveyShell } from './shell-site';
import type { ShellRouteReport } from './shell-site';
import { siteHandler } from './site';
import { writeStylesheetIntoPage } from './stylesheet';

// ═══════════════════════════════════════════════════════════════
// What `nisc` does. Each command is the app's own machinery, run in order:
//
//   dev     the app's own vite, with the app server inside it when it has one
//   build   bundle the terminal and write its stylesheet into its page, then
//           draw every path once and say how each is served — a file, or a server
//   export  build, then write every path as a file: the whole site as a folder
//   start   serve the built terminal from the app's own process, pages drawn —
//           compressed, and with what a browser may keep said (./site)
//   check   the app's check suite
//
// Nothing here knows an app. How it boots and how a screen is drawn come from
// its nisc.config.ts. An app behind moss hands over its server, and which paths
// exist and what each needs come from that (`server.pages`, `exportDocuments`).
// An app with its own shell hands over its boot, and every path is drawn from
// that and checked (./shell-site). Moss is loaded only for the first kind — an
// app without it does not have it installed.
// ═══════════════════════════════════════════════════════════════

export type CommandOptions = {
  // the app's root (where nisc.config.ts is)
  root: string;
  // export: where the files go (default `out`), relative to the root
  out?: string;
  // export: write the site even though some path wants a server behind it
  allowLive?: boolean;
  // start: the port (default $PORT, then 8787)
  port?: number;
  // build/export: skip the bundler (the terminal is already built)
  skipBundle?: boolean;
  print?: (line: string) => void;
};

const say = (options: CommandOptions): ((line: string) => void) => options.print ?? ((line) => console.log(line));

// A tool the APP has installed, found from the app's own root — the command
// carries no bundler and no test runner of its own.
const toolOf = (root: string, name: string, bin: string): string => {
  const require = createRequire(join(root, 'package.json'));
  let manifestPath: string;
  try {
    manifestPath = require.resolve(`${name}/package.json`);
  } catch {
    throw new Error(`nisc: this app has no ${name} installed (looked from ${root}).`);
  }
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bins: unknown = manifest !== null && typeof manifest === 'object' ? Reflect.get(manifest, 'bin') : undefined;
  const relative: unknown = typeof bins === 'string' ? bins : bins !== null && typeof bins === 'object' ? Reflect.get(bins, bin) : undefined;
  if (typeof relative !== 'string') throw new Error(`nisc: ${name} ships no "${bin}" command.`);
  return join(dirname(manifestPath), relative);
};

const distOf = (root: string, project: NiscProject): string => resolve(root, project.dist ?? 'dist');

// The app's own vite, and then the one thing done to what it wrote: the page's
// stylesheet goes into the page (./stylesheet). A terminal that is already built
// (`skipBundle`) is taken as it is.
const bundle = (options: CommandOptions, project: NiscProject): void => {
  const result = spawnSync(process.execPath, [toolOf(options.root, 'vite', 'vite'), 'build'], { cwd: options.root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('nisc: the bundler failed — nothing was drawn.');
  if (project.stylesheet === 'file') return;
  const print = say(options);
  const { inPage, left } = writeStylesheetIntoPage(distOf(options.root, project));
  if (inPage.length + left.length > 0) print('');
  for (const sheet of inPage) print(`nisc: ${sheet.href} is in the page (${(sheet.bytes / 1024).toFixed(1)} kB) — one response paints it`);
  for (const sheet of left) print(`nisc: ${sheet.href} stays a file — ${sheet.why}`);
  if (inPage.length > 0) print("      A Content-Security-Policy that forbids inline styles would refuse it: `stylesheet: 'file'` in nisc.config.ts keeps it a file.");
};

// `start` tells browsers to keep what is under /assets/ for a year — right for
// what the bundler writes there, named by its content. The bundler also copies
// the app's public/ as it is, so a file of the app's own under public/assets/
// would be kept just as long, under a name that says nothing about its content.
const warnOfOwnAssets = (options: CommandOptions): void => {
  if (!existsSync(join(options.root, 'public', 'assets'))) return;
  say(options)('nisc: public/assets/ holds files of your own. `nisc start` has browsers keep everything under /assets/ for a year, so a change to one of them will not be seen under the same name — keep them elsewhere in public/.');
};

// Stand the app up, draw every path once for nobody, let the app go.
const templateOf = (options: CommandOptions, project: NiscProject): string => {
  const template = join(distOf(options.root, project), 'index.html');
  if (!existsSync(template)) throw new Error(`nisc: no built terminal at ${template} — run \`nisc build\`.`);
  return readFileSync(template, 'utf8');
};

const survey = async (options: CommandOptions, project: NiscMossProject): Promise<ExportedDocument[]> => {
  const template = templateOf(options, project);
  const { exportDocuments } = await import('@niscorp/moss');
  const booted = await project.boot();
  try {
    const paths = project.paths === undefined ? defaultPaths(booted.server.pages) : await project.paths(booted.server);
    return await exportDocuments({
      server: booted.server,
      template,
      draw: project.draw,
      ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
      ...(project.tokenKey !== undefined ? { tokenKey: project.tokenKey } : {}),
      paths,
    });
  } finally {
    await booted.close?.();
  }
};

// What a build found, either way round: every path, and whether the build holds.
export type BuildResult =
  | { kind: 'moss'; ok: boolean; routes: ExportedDocument[] }
  | { kind: 'shell'; ok: boolean; routes: ShellRouteReport[] };

const buildShell = async (options: CommandOptions, project: NiscShellProject): Promise<BuildResult> => {
  const routes = await surveyShell(options.root, project, templateOf(options, project));
  say(options)('');
  say(options)(shellRouteTable(routes));
  return { kind: 'shell', ok: routes.every((route) => route.problems.length === 0), routes };
};

export const build = async (options: CommandOptions): Promise<BuildResult> => {
  const project = await loadProject(options.root);
  if (options.skipBundle !== true) bundle(options, project);
  warnOfOwnAssets(options);
  if (isShellProject(project)) return buildShell(options, project);
  const routes = await survey(options, project);
  say(options)('');
  say(options)(routeTable(routes));
  return { kind: 'moss', ok: routes.every((route) => route.drawn), routes };
};

const write = (options: CommandOptions, project: NiscProject, out: string, routes: readonly { path: string; html: string }[]): void => {
  rmSync(out, { recursive: true, force: true });
  cpSync(distOf(options.root, project), out, { recursive: true });
  for (const route of routes) {
    const file = join(out, fileOf(route.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, route.html);
  }
  say(options)('');
  say(options)(`nisc: ${routes.length} paths written to ${out}`);
};

// The whole site as a folder. A path that wants a server behind it is not
// something a folder can be — so unless the caller says a server will stand
// beside the files (`allowLive`), nothing is written and the table says why.
//
// An app with its own shell has no such path: the shell is in the page, so a
// folder is all of it. What stops ITS files is a check that did not hold.
export const exportSite = async (options: CommandOptions): Promise<{ written: boolean; result: BuildResult; out: string }> => {
  const project = await loadProject(options.root);
  const result = await build(options);
  const out = resolve(options.root, options.out ?? 'out');
  if (result.kind === 'shell') {
    if (!result.ok) {
      const failed = result.routes.filter((route) => route.problems.length > 0);
      say(options)('');
      say(options)(`nisc: ${failed.length} of ${result.routes.length} paths did not hold (${failed.map((route) => route.path).join(', ')}). Nothing was written.`);
      return { written: false, result, out };
    }
    write(options, project, out, result.routes);
    return { written: true, result, out };
  }
  const routes = result.routes;
  const live = routes.filter((route) => route.live || !route.drawn);
  if (live.length > 0 && options.allowLive !== true) {
    say(options)('');
    say(options)(`nisc: ${live.length} of ${routes.length} paths cannot be a file alone (${live.map((route) => route.path).join(', ')}).`);
    say(options)('      Nothing was written. With a server beside the files they still work: `nisc export --allow-live`.');
    return { written: false, result, out };
  }
  write(options, project, out, routes);
  return { written: true, result, out };
};

const listening = async (httpServer: ReturnType<typeof serve>, options: CommandOptions): Promise<string> => {
  await new Promise<void>((up) => httpServer.once('listening', () => up()));
  const address = httpServer.address();
  const port = address !== null && typeof address === 'object' ? (address satisfies AddressInfo).port : options.port;
  return `http://localhost:${port}`;
};

export const start = async (options: CommandOptions): Promise<{ url: string; close: () => Promise<void> }> => {
  const project = await loadProject(options.root);
  const dist = distOf(options.root, project);
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`nisc: no built terminal in ${dist} — run \`nisc build\`.`);
  const port = options.port ?? Number(process.env['PORT'] ?? 8787);
  if (isShellProject(project)) {
    // no server shell, no socket: each path's first answer is its screen, drawn
    // from a boot of the app's own, and the page's shell takes it from there
    const httpServer = serve({ fetch: siteHandler(shellSite(project, dist)), port });
    const url = await listening(httpServer, options);
    say(options)(`nisc: serving ${url} — the built app, each path’s first screen drawn; the shell is the page’s own`);
    return { url, close: async () => void httpServer.close() };
  }
  const { attachSocket, mountSite, MOSS_PATHS } = await import('@niscorp/moss/node');
  const booted = await project.boot();
  await project.routes?.(booted.server);
  mountSite(booted.server, {
    dist,
    draw: project.draw,
    ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
    ...(project.tokenKey !== undefined ? { tokenKey: project.tokenKey } : {}),
  });
  // what the app server answers itself is its own to say; the rest is the site
  const httpServer = serve({ fetch: siteHandler(booted.server.fetch, { except: MOSS_PATHS }), port });
  attachSocket(httpServer, booted.server.socket);
  const url = await listening(httpServer, options);
  say(options)(`nisc: serving ${url} — the built terminal, its pages drawn; the socket at /socket`);
  return {
    url,
    close: async () => {
      httpServer.close();
      await booted.close?.();
    },
  };
};

// The two that hand over to a tool of the app's own and stay out of the way.
const handOver = (options: CommandOptions, tool: string, args: readonly string[]): Promise<number> =>
  new Promise((done) => {
    const child = spawn(process.execPath, [tool, ...args], { cwd: options.root, stdio: 'inherit' });
    child.once('exit', (code) => done(code ?? 1));
  });

export const dev = (options: CommandOptions): Promise<{ url: string; close: () => Promise<void> }> =>
  devServer({ root: options.root, ...(options.port !== undefined ? { port: options.port } : {}) });

export const check = async (options: CommandOptions): Promise<number> => {
  const project = await loadProject(options.root);
  return handOver(options, toolOf(options.root, 'tsx', 'tsx'), [project.checks ?? 'src/dev/all-checks.ts']);
};
