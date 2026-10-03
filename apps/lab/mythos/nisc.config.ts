import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { NiscShellProject } from '@niscorp/cli';
import { boot } from './src/boot';
import { Screen, adopt } from './src/ui/screen';

// WHAT MYTHOS SAYS ABOUT ITSELF to the `nisc` command. Mythos has no server: its
// shell, its database (PGlite) and its endpoints all live in the page. So it
// hands over its own boot — the one main.tsx runs — and the two ends of a drawn
// screen: how it is drawn to markup, and how the page picks that markup up.
//
//   pnpm nisc build     bundle, draw every path, and check what was drawn
//   pnpm nisc export    …and write each path as a file: the site as a folder
//   pnpm nisc start     serve the bundle, each path's first screen drawn
//
// Mythos does not sync its shell to the address bar (D5), so there is one path.
export const project: NiscShellProject = {
  shell: async () => {
    const app = await boot();
    return { shell: app.shell, close: () => app.db.close() };
  },
  draw: (shell) => renderToString(createElement(Screen, { shell })),
  adopt,
};
