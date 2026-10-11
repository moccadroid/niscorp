import type { NiscProject } from '@niscorp/cli';
import { boot } from '@atrium/server/boot';
import { drawing } from '@atrium/server/document';
import { mintToken } from '@atrium/server/users';

// WHAT ATRIUM SAYS ABOUT ITSELF to the `nisc` command — the things only the
// app knows. How it stands up is the same boot the dev server and the checks
// run; how a screen is drawn is the same description the dev server and the
// built terminal's route use (src/server/document.ts).
//
//   pnpm dev            vite, with the app server inside it (`nisc dev`)
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
  dev: {
    // `/dev/as/<username>` — a signed-in URL, in the dev server and nowhere
    // else. A headless browser can photograph a page but cannot click one, so
    // any judgement about a SIGNED-IN screen would otherwise be made without
    // looking at it. This mints the token the login page mints; the dev
    // server puts it in the browser's cookie and sends the page on.
    signIn: (_server, who) => mintToken(who),
  },
};
