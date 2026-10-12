import type { NiscMossProject } from '@niscorp/cli';
import { boot } from './src/server/boot';
import { drawing } from './src/server/document';

export const project: NiscMossProject = {
  boot: async () => {
    const { server } = await boot();
    return { server, close: () => server.close() };
  },
  ...drawing,
};
