import type { NiscProject } from '@niscorp/cli';
import { bootDevServer } from '@lyra/server/boot';
import { drawing } from '@lyra/server/document';
import { mintToken } from '@lyra/server/tokens';

export const project: NiscProject = {
  boot: async () => {
    process.env['LYRA_DEV_LOGIN'] ??= 'on';
    const { server } = await bootDevServer();
    return { server, close: () => server.close() };
  },
  ...drawing,
  dev: {
    signIn: (server, who) => mintToken(server.executeAs, who),
  },
};
