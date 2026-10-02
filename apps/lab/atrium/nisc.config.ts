import type { NiscProject } from '@niscorp/cli';
import { boot } from '@atrium/server/boot';
import { drawing } from '@atrium/server/document';

// WHAT ATRIUM SAYS ABOUT ITSELF to the `nisc` command — the two things only the
// app knows. How it stands up is the same boot the dev server and the checks
// run; how a screen is drawn is the same description the dev server and the
// built terminal's route use (src/server/document.ts).
//
//   pnpm nisc build     bundle the terminal, then say how each path is served
//   pnpm nisc export    …and write every path as a file
//   pnpm nisc start     serve the built terminal, pages drawn
//
// Which paths exist is read off the manifest (`/`, and every page).
export const project: NiscProject = {
  boot: async () => {
    const { server } = await boot();
    return { server, close: () => server.close() };
  },
  ...drawing,
};
