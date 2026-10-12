import type { NiscProject } from '@niscorp/cli';
import { boot } from '@atrium/server/boot';
import { drawing } from '@atrium/server/document';
import { mintToken } from '@atrium/server/users';

export const project: NiscProject = {
  boot: async () => {
    const { server } = await boot();
    return { server, close: () => server.close() };
  },
  ...drawing,
  dev: {
    signIn: (_server, who) => mintToken(who),
  },
};
