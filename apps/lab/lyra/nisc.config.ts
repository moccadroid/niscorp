import type { NiscProject } from '@niscorp/cli';
import { bootDevServer } from '@lyra/server/boot';
import { drawing } from '@lyra/server/document';

// WHAT LYRA SAYS ABOUT ITSELF to the `nisc` command — the two things only the
// app knows: how it stands up (the boot its checks run) and how one of its
// screens is drawn (src/server/document.ts).
//
//   pnpm nisc build     bundle the terminal, then say how each path is served
//   pnpm nisc start     serve the built terminal, pages drawn
//
// The boot is the one the vite plugin and the standalone listener run
// (`bootDevServer`), with the lab's sign-in transport on, as they have it: the
// picker is how a nonce reaches the browser here (src/server/serve.ts).
export const project: NiscProject = {
  boot: async () => {
    process.env['LYRA_DEV_LOGIN'] ??= 'on';
    const { server } = await bootDevServer();
    return { server, close: () => server.close() };
  },
  ...drawing,
};
