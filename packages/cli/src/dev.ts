import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configFileOf, isProject, isShellProject, loadProject } from './project';

// ═══════════════════════════════════════════════════════════════
// `nisc dev` — the app's own vite, started from here.
//
// An app with its own shell is a vite app and nothing more. An app behind moss
// also needs its server inside that dev process, and that is moss's plugin
// (`@niscorp/moss/vite`): added here, fed from the app's nisc.config.ts — the
// same boot and the same drawing `nisc build` and `nisc start` use, loaded
// through vite so an edit is a fresh boot. The app's vite.config.ts stays what
// it is: its framework's plugin, its aliases.
// ═══════════════════════════════════════════════════════════════

// What is used of the app's vite — described here rather than imported, since
// the vite is the app's and its types are the app's too.
type DevServer = {
  listen: () => Promise<unknown>;
  printUrls: () => void;
  resolvedUrls: { local: string[] } | null;
  close: () => Promise<void>;
};
type ViteApi = { createServer: (config: { root: string; server?: { port: number }; plugins: unknown[] }) => Promise<DevServer> };

const isViteApi = (value: unknown): value is ViteApi =>
  value !== null && typeof value === 'object' && typeof Reflect.get(value, 'createServer') === 'function';

// The app's vite — the command carries none of its own.
const viteOf = async (root: string): Promise<ViteApi> => {
  let entry: string;
  try {
    entry = createRequire(join(root, 'package.json')).resolve('vite');
  } catch {
    throw new Error(`nisc: this app has no vite installed (looked from ${root}).`);
  }
  const loaded: unknown = await import(pathToFileURL(entry).href);
  if (!isViteApi(loaded)) throw new Error(`nisc: ${entry} is not vite.`);
  return loaded;
};

// moss's dev plugin, fed from the config as vite loads it.
const mossPlugin = async (configFile: string): Promise<unknown> => {
  const { mossDev } = await import('@niscorp/moss/vite');
  return mossDev({
    label: 'nisc',
    app: async (load) => {
      const loaded = await load(`/${configFile}`);
      const project: unknown = Reflect.get(loaded, 'project');
      if (!isProject(project) || isShellProject(project)) throw new Error(`nisc: ${configFile} no longer describes an app behind moss.`);
      const booted = await project.boot();
      const signIn = project.dev?.signIn;
      return {
        server: booted.server,
        ...(booted.close !== undefined ? { close: booted.close } : {}),
        draw: project.draw,
        ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
        ...(project.tokenKey !== undefined ? { tokenKey: project.tokenKey } : {}),
        ...(signIn !== undefined ? { signIn: (who: string) => signIn(booted.server, who) } : {}),
      };
    },
  });
};

export const devServer = async (options: { root: string; port?: number }): Promise<{ url: string; close: () => Promise<void> }> => {
  const project = await loadProject(options.root);
  const configFile = configFileOf(options.root);
  const vite = await viteOf(options.root);
  const server = await vite.createServer({
    root: options.root,
    ...(options.port !== undefined ? { server: { port: options.port } } : {}),
    plugins: isShellProject(project) || configFile === undefined ? [] : [await mossPlugin(configFile)],
  });
  await server.listen();
  server.printUrls();
  const url = server.resolvedUrls?.local[0] ?? `http://localhost:${options.port ?? 5173}/`;
  return { url, close: () => server.close() };
};
