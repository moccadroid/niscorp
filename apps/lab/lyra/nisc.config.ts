import type { NiscProject } from '@niscorp/cli';
import { bootDevServer } from '@lyra/server/boot';
import { drawing } from '@lyra/server/document';
import { mintToken } from '@lyra/server/tokens';

// WHAT LYRA SAYS ABOUT ITSELF to the `nisc` command — the things only the app
// knows: how it stands up (the boot its checks run), how one of its screens is
// drawn (src/server/document.ts), and who the dev sign-in signs in.
//
//   pnpm dev            vite, with the app server inside it (`nisc dev`)
//   pnpm nisc build     bundle the terminal, then say how each path is served
//   pnpm nisc start     serve the built terminal, pages drawn
//
// The boot is the one the dev server and the standalone listener run
// (`bootDevServer`), with the lab's sign-in transport on, as they have it: the
// picker is how a nonce reaches the browser here (src/server/serve.ts).
export const project: NiscProject = {
  boot: async () => {
    process.env['LYRA_DEV_LOGIN'] ??= 'on';
    const { server } = await bootDevServer();
    return { server, close: () => server.close() };
  },
  ...drawing,
  dev: {
    // `/dev/as/<email>` — a signed-in URL, in the dev server and nowhere else.
    // A headless browser can photograph a page but cannot click one, so any
    // judgement about a SIGNED-IN screen would otherwise be made without
    // looking at it. This mints the dev token the login page mints, for
    // whoever the address resolves to, read through the server that is
    // answering (`executeAs`), so it cannot drift from it.
    signIn: (server, who) => mintToken(server.executeAs, who),
  },
};
