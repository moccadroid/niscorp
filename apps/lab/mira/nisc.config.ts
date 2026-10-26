import type { NiscMossProject } from '@niscorp/cli';
import { MOSS_PATHS } from '@niscorp/moss/node';
import { boot, migration } from './src/server/boot';
import type { Booted } from './src/server/boot';
import { drawing } from './src/server/document';

// `routes` and `dev.signIn` are handed the server `boot` answered, and need the door booted with it.
let booted: Booted | undefined;
const door = (): Booted['door'] => {
  if (booted === undefined) throw new Error('mira: the app has not booted.');
  return booted.door;
};

export const project: NiscMossProject = {
  boot: async () => {
    booted = await boot();
    return { server: booted.server, close: booted.close };
  },
  routes: (server) => door().routes(server),
  ...migration,
  dev: {
    signIn: (_server, who) => door().signIn(who),
    owned: new RegExp(`${MOSS_PATHS.source}|^/login$`),
  },
  ...drawing,
};
