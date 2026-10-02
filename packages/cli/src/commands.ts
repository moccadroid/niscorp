import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { exportDocuments } from '@niscorp/moss';
import type { ExportedDocument } from '@niscorp/moss';
import { attachSocket, mountSite } from '@niscorp/moss/node';
import { loadProject } from './project';
import type { NiscProject } from './project';
import { defaultPaths, fileOf, routeTable } from './routes';

// ═══════════════════════════════════════════════════════════════
// What `nisc` does. Each command is the app's own machinery, run in order:
//
//   dev     the app's dev server (its vite config, which hosts the app server)
//   build   bundle the terminal, then draw every path once and say how each is
//           served — a file, or a server
//   export  build, then write every path as a file: the whole site as a folder
//   start   serve the built terminal from the app's own process, pages drawn
//   check   the app's check suite
//
// Nothing here knows an app. How it boots and how a screen is drawn come from
// its nisc.config.ts; which paths exist and what each needs come from the
// booted server (moss: `server.pages`, `exportDocuments`).
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

const bundle = (options: CommandOptions): void => {
  const result = spawnSync(process.execPath, [toolOf(options.root, 'vite', 'vite'), 'build'], { cwd: options.root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('nisc: the bundler failed — nothing was drawn.');
};

// Stand the app up, draw every path once for nobody, let the app go.
const survey = async (options: CommandOptions, project: NiscProject): Promise<ExportedDocument[]> => {
  const template = join(distOf(options.root, project), 'index.html');
  if (!existsSync(template)) throw new Error(`nisc: no built terminal at ${template} — run \`nisc build\`.`);
  const booted = await project.boot();
  try {
    const paths = project.paths === undefined ? defaultPaths(booted.server.pages) : await project.paths(booted.server);
    return await exportDocuments({
      server: booted.server,
      template: readFileSync(template, 'utf8'),
      draw: project.draw,
      ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
      ...(project.tokenKey !== undefined ? { tokenKey: project.tokenKey } : {}),
      paths,
    });
  } finally {
    await booted.close?.();
  }
};

export const build = async (options: CommandOptions): Promise<ExportedDocument[]> => {
  const project = await loadProject(options.root);
  if (options.skipBundle !== true) bundle(options);
  const routes = await survey(options, project);
  say(options)('');
  say(options)(routeTable(routes));
  return routes;
};

// The whole site as a folder. A path that wants a server behind it is not
// something a folder can be — so unless the caller says a server will stand
// beside the files (`allowLive`), nothing is written and the table says why.
export const exportSite = async (options: CommandOptions): Promise<{ written: boolean; routes: ExportedDocument[]; out: string }> => {
  const project = await loadProject(options.root);
  const routes = await build(options);
  const out = resolve(options.root, options.out ?? 'out');
  const live = routes.filter((route) => route.live || !route.drawn);
  if (live.length > 0 && options.allowLive !== true) {
    say(options)('');
    say(options)(`nisc: ${live.length} of ${routes.length} paths cannot be a file alone (${live.map((route) => route.path).join(', ')}).`);
    say(options)('      Nothing was written. With a server beside the files they still work: `nisc export --allow-live`.');
    return { written: false, routes, out };
  }
  rmSync(out, { recursive: true, force: true });
  cpSync(distOf(options.root, project), out, { recursive: true });
  for (const route of routes) {
    const file = join(out, fileOf(route.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, route.html);
  }
  say(options)('');
  say(options)(`nisc: ${routes.length} paths written to ${out}`);
  return { written: true, routes, out };
};

export const start = async (options: CommandOptions): Promise<{ url: string; close: () => Promise<void> }> => {
  const project = await loadProject(options.root);
  const dist = distOf(options.root, project);
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`nisc: no built terminal in ${dist} — run \`nisc build\`.`);
  const booted = await project.boot();
  await project.routes?.(booted.server);
  mountSite(booted.server, {
    dist,
    draw: project.draw,
    ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
    ...(project.tokenKey !== undefined ? { tokenKey: project.tokenKey } : {}),
  });
  const httpServer = serve({ fetch: booted.server.fetch, port: options.port ?? Number(process.env['PORT'] ?? 8787) });
  attachSocket(httpServer, booted.server.socket);
  await new Promise<void>((listening) => httpServer.once('listening', () => listening()));
  const address = httpServer.address();
  const port = address !== null && typeof address === 'object' ? (address satisfies AddressInfo).port : options.port;
  const url = `http://localhost:${port}`;
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

export const dev = (options: CommandOptions): Promise<number> => handOver(options, toolOf(options.root, 'vite', 'vite'), []);

export const check = async (options: CommandOptions): Promise<number> => {
  const project = await loadProject(options.root);
  return handOver(options, toolOf(options.root, 'tsx', 'tsx'), [project.checks ?? 'src/dev/all-checks.ts']);
};
