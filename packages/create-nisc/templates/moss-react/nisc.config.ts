import type { NiscMossProject } from '@niscorp/cli';
import { boot } from './src/server/boot';
import { drawing } from './src/server/document';

// What this app tells the `nisc` command: how it stands up (the same boot the
// checks run) and how one of its screens is drawn (the same drawing the dev
// server and `nisc start` use). Everything else is read off the app.
//
//   npm run dev      the app, with its server inside vite
//   npm run build    bundle, then say how each path is served
//   npm start        serve the built app, each first screen drawn
//   npm run check    the checks in src/dev
export const project: NiscMossProject = {
  boot: async () => {
    const { server } = await boot();
    return { server, close: () => server.close() };
  },
  ...drawing,
};
