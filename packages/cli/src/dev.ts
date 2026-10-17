import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configFileOf, isProject, isShellProject, loadProject } from './project';
import type { NiscMossProject } from './project';

// Declared here rather than imported: vite is the app's dependency, and so are
// its types.
type DevServer = {
  listen: () => Promise<unknown>;
  printUrls: () => void;
  resolvedUrls: { local: string[] } | null;
  close: () => Promise<void>;
};
type ViteApi = { createServer: (config: { root: string; server?: { port: number }; plugins: unknown[] }) => Promise<DevServer> };

const isViteApi = (value: unknown): value is ViteApi =>
  value !== null && typeof value === 'object' && typeof Reflect.get(value, 'createServer') === 'function';

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

// Read once, when the command starts: a change to one takes a restart of
// `nisc dev`, unlike the rest of the config, which vite reloads.
export const devPluginOptionsOf = (dev: NiscMossProject['dev']): { watch?: RegExp; owned?: RegExp; signInFromNetwork?: boolean } => ({
  ...(dev?.watch !== undefined ? { watch: dev.watch } : {}),
  ...(dev?.owned !== undefined ? { owned: dev.owned } : {}),
  ...(dev?.signInFromNetwork !== undefined ? { signInFromNetwork: dev.signInFromNetwork } : {}),
});

const mossPlugin = async (configFile: string, dev: NiscMossProject['dev']): Promise<unknown> => {
  const { mossDev } = await import('@niscorp/moss/vite');
  return mossDev({
    label: 'nisc',
    ...devPluginOptionsOf(dev),
    app: async (load) => {
      const loaded = await load(`/${configFile}`);
      const project: unknown = Reflect.get(loaded, 'project');
      if (!isProject(project) || isShellProject(project)) throw new Error(`nisc: ${configFile} no longer describes an app behind moss.`);
      const booted = await project.boot();
      try {
        await booted.server.checkFunctions();
      } catch (error) {
        await booted.close?.();
        throw error;
      }
      const signIn = project.dev?.signIn;
      return {
        server: booted.server,
        ...(booted.close !== undefined ? { close: booted.close } : {}),
        draw: project.draw,
        ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
        ...(project.site !== undefined ? { site: project.site } : {}),
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
    plugins: isShellProject(project) || configFile === undefined ? [] : [await mossPlugin(configFile, project.dev)],
  });
  await server.listen();
  server.printUrls();
  const url = server.resolvedUrls?.local[0] ?? `http://localhost:${options.port ?? 5173}/`;
  return { url, close: () => server.close() };
};
