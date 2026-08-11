// .env first — OPERATOR_KEY lives there, on both sides of the seam.
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';

// THE TOOL'S OWN PAGE, ON ITS OWN PORT.
//
// It used to be a strip injected into Lyra's page, which borrowed Lyra's
// component kit and put operator credentials in a tenant's browsing context to
// save writing a registry. It has its own now (src/ui/registry.tsx), so it can
// be what it always should have been: a separate application at a separate
// address that happens to administer another one.
//
// The moss server runs INSIDE this vite process, the same arrangement Lyra
// uses: one command, one port, no proxy.

type BootedServer = {
  fetch: (req: Request) => Response | Promise<Response>;
  socket: Parameters<typeof attachSocket>[1];
};

const adminServer = (): Plugin => ({
  name: 'lyra-admin-server',
  configureServer: (viteServer: ViteDevServer) => {
    const build = async (): Promise<{ listener: ReturnType<typeof getRequestListener>; server: BootedServer }> => {
      const mod = (await viteServer.ssrLoadModule('/src/service.ts')) as {
        buildAdminServer: (seam: unknown) => Promise<BootedServer>;
      };
      const seamMod = (await viteServer.ssrLoadModule('/src/seam.ts')) as {
        httpSeam: (base: string, key: string) => unknown;
      };
      const portMod = (await viteServer.ssrLoadModule('/src/port.ts')) as {
        lyraBase: () => string;
        operatorKey: () => string;
      };
      const server = await mod.buildAdminServer(seamMod.httpSeam(portMod.lyraBase(), portMod.operatorKey()));
      return { listener: getRequestListener(server.fetch), server };
    };

    let current = build();

    if (viteServer.httpServer !== null) {
      attachSocket(
        viteServer.httpServer,
        Object.assign(
          async (url: string, connection: Parameters<BootedServer['socket']>[1]) => (await current).server.socket(url, connection),
          { stop: () => void current.then(({ server }) => server.socket.stop(), () => {}) },
        ),
      );
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const rebuild = (file: string): void => {
      if (!/[\\/]src[\\/](app|ui)[\\/]/.test(file) && !file.endsWith('service.ts')) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        current = build();
        void current.then(() => viteServer.ws.send({ type: 'full-reload' }), () => {});
      }, 200);
    };
    viteServer.watcher.on('change', rebuild);

    viteServer.middlewares.use((req, res, next) => {
      // The tool's server owns `/catalog` and nothing else — it has no vex and
      // no data layer, so there is no `/api` to route.
      if (req.url?.startsWith('/catalog') === true) {
        void current.then(({ listener }) => listener(req, res));
        return;
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), adminServer()],
  server: { port: 5190, strictPort: true },
});
