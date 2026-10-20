import { PGlite } from '@electric-sql/pglite';
import { createServer, defineApp } from '@niscorp/moss';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { NiscMossProject } from '../../../src';

// Nobody's shell reads `/hello` as it mounts, so checking the functions answers a request in-process.
const app = defineApp({
  charter: { public: { actions: ['home'], functions: ['greet'] } },
  actions: {
    home: {
      id: 'home',
      data: { said: '' },
      endpoints: { load: { url: '/hello', method: 'GET', target: 'said' } },
      lifecycle: { mount: [{ call: 'load' }] },
    },
  },
  shell: { canvases: [{ id: 'main', initial: 'home' }] },
  functions: () => [{ id: 'greet', description: 'Answers hello.', execute: async () => 'hello' }],
});

export const project: NiscMossProject = {
  boot: async () => {
    const db = new PGlite();
    const server = await createServer(app, { db, pool: createPglitePool(db), session: 'dev-open' });
    return {
      server,
      close: async () => {
        server.close();
        await db.close();
      },
    };
  },
  routes: (server) => {
    server.get('/hello', (c) => c.text('hello'));
  },
  draw: () => '<p>drawn</p>',
  dist: 'built',
};
