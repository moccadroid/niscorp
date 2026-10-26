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

// Moss is loaded by a dynamic import, and only for an app behind it: an app
// with its own shell does not have it installed.

export type CommandOptions = {
  root: string;
  out?: string;
  allowLive?: boolean;
  port?: number;
  skipBundle?: boolean;
  dryRun?: boolean;
  print?: (line: string) => void;
};

const say = (options: CommandOptions): ((line: string) => void) => options.print ?? ((line) => console.log(line));

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

const warnOfOwnAssets = (options: CommandOptions): void => {
  if (!existsSync(join(options.root, 'public', 'assets'))) return;
  say(options)('nisc: public/assets/ holds files of your own. `nisc start` has browsers keep everything under /assets/ for a year, so a change to one of them will not be seen under the same name — keep them elsewhere in public/.');
};

const warnOfOneAddress = (options: CommandOptions, project: NiscProject, template: string, paths: number): void => {
  if (project.site !== undefined || paths < 2 || !/<link\b[^>]*\brel\s*=\s*["']?canonical\b/i.test(template)) return;
  say(options)('');
  say(options)(`nisc: index.html names one canonical address and this app has ${paths} paths — every file would say it lives there.`);
  say(options)('      `site: "https://…"` in nisc.config.ts gives each path its own.');
};

const templateOf =(options: CommandOptions, project: NiscProject): string => {
  const template = join(distOf(options.root, project), 'index.html');
  if (!existsSync(template)) throw new Error(`nisc: no built terminal at ${template} — run \`nisc build\`.`);
  return readFileSync(template, 'utf8');
};

const survey = async (options: CommandOptions, project: NiscMossProject): Promise<ExportedDocument[]> => {
  const template = templateOf(options, project);
  const { exportDocuments } = await import('@niscorp/moss');
  const booted = await project.boot();
  try {
    await booted.server.checkFunctions();
    const paths = project.paths === undefined ? defaultPaths(booted.server.pages) : await project.paths(booted.server);
    return await exportDocuments({
      server: booted.server,
      template,
      draw: project.draw,
      ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
      ...(project.site !== undefined ? { site: project.site } : {}),
      ...(project.tokenKey !== undefined ? { tokenKey: project.tokenKey } : {}),
      paths,
    });
  } finally {
    await booted.close?.();
  }
};

export type BuildResult =
  | { kind: 'moss'; ok: boolean; routes: ExportedDocument[] }
  | { kind: 'shell'; ok: boolean; routes: ShellRouteReport[] };

const buildShell = async (options: CommandOptions, project: NiscShellProject): Promise<BuildResult> => {
  const template = templateOf(options, project);
  const routes = await surveyShell(options.root, project, template);
  say(options)('');
  say(options)(shellRouteTable(routes));
  warnOfOneAddress(options, project, template, routes.length);
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
  warnOfOneAddress(options, project, templateOf(options, project), routes.length);
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
    const httpServer = serve({ fetch: siteHandler(shellSite(project, dist)), port });
    const url = await listening(httpServer, options);
    say(options)(`nisc: serving ${url} — the built app, each path’s first screen drawn; the shell is the page’s own`);
    return { url, close: async () => void httpServer.close() };
  }
  const { attachSocket, mountSite, MOSS_PATHS } = await import('@niscorp/moss/node');
  const booted = await project.boot();
  try {
    await project.routes?.(booted.server);
    mountSite(booted.server, {
      dist,
      draw: project.draw,
      ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
      ...(project.site !== undefined ? { site: project.site } : {}),
      ...(project.tokenKey !== undefined ? { tokenKey: project.tokenKey } : {}),
    });
    // After every route: the check answers requests in-process, and Hono takes no route once it has answered one.
    await booted.server.checkFunctions();
  } catch (error) {
    await booted.close?.();
    throw error;
  }
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

export const migrate = async (options: CommandOptions): Promise<void> => {
  const project = await loadProject(options.root);
  if (isShellProject(project) || project.app === undefined || project.runtime === undefined) {
    throw new Error('nisc: `nisc migrate` needs `app` and `runtime` in nisc.config.ts — the manifest, and the environment it runs on.');
  }
  const { migrateTables } = await import('@niscorp/moss');
  const print = say(options);
  const isDryRun = options.dryRun === true;
  const runtime = await project.runtime();
  try {
    const report = await migrateTables(runtime, project.app, isDryRun ? { dryRun: true } : {});
    if (report.applied.length === 0) print('nisc: nothing to migrate');
    else print(isDryRun ? `nisc: would apply ${report.applied.length} — rolled back, nothing changed` : `nisc: applied ${report.applied.length}`);
    for (const migration of report.applied) print(`  ${migration.ref}  ${migration.description}`);
    if (report.removed.length > 0) print(`nisc: this run removes ${report.removed.join(', ')}`);
    if (report.retyped.length > 0) print(`nisc: this run changes the type of ${report.retyped.join(', ')}`);
    if (report.alreadyBroken.length > 0) print('nisc: not fitting before this run either, and seeded as they are — said, not refused:');
    for (const entry of report.alreadyBroken) print(`  ${entry}`);
  } finally {
    await runtime.close?.();
  }
};

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
