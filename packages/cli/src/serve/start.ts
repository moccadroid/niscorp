import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { distOf, isShellProject, loadProject, say } from '../project';
import type { CommandOptions } from '../project';
import { shellSite } from './shell-site';
import { siteHandler } from './site';

export const portOf = (text: string, from: string): number => {
  const port = Number(text);
  if (Number.isInteger(port) && port >= 0 && port <= 65535) return port;
  throw new Error(`nisc: ${from} ${JSON.stringify(text)} is not a port. Give a whole number from 0 to 65535.`);
};

const listening = (httpServer: ReturnType<typeof serve>, port: number): Promise<string> =>
  new Promise((up, fail) => {
    const refused = (error: Error): void => fail(new Error(`nisc: cannot listen on port ${port} (${error.message}). Stop what is using it, or give another port: \`--port <n>\`.`));
    httpServer.once('error', refused);
    httpServer.once('listening', () => {
      httpServer.off('error', refused);
      const address = httpServer.address();
      up(`http://localhost:${address !== null && typeof address === 'object' ? (address satisfies AddressInfo).port : port}`);
    });
  });

export const start = async (options: CommandOptions): Promise<{ url: string; close: () => Promise<void> }> => {
  const project = await loadProject(options.root);
  const dist = distOf(options.root, project);
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`nisc: no built terminal in ${dist} — run \`nisc build\`.`);
  if (options.port === undefined && process.env['PORT'] === '') say(options)('nisc: PORT is set but empty, read as 0: any free port. Unset it for 8787.');
  const port = options.port ?? portOf(process.env['PORT'] ?? '8787', 'PORT');
  if (isShellProject(project)) {
    const httpServer = serve({ fetch: siteHandler(shellSite(project, dist)), port });
    const url = await listening(httpServer, port);
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
    const httpServer = serve({ fetch: siteHandler(booted.server.fetch, { except: MOSS_PATHS }), port });
    attachSocket(httpServer, booted.server.socket);
    const url = await listening(httpServer, port);
    say(options)(`nisc: serving ${url} — the built terminal, its pages drawn; the socket at /socket`);
    return {
      url,
      close: async () => {
        httpServer.close();
        await booted.close?.();
      },
    };
  } catch (error) {
    await booted.close?.();
    throw error;
  }
};
