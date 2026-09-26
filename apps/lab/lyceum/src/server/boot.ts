import { createServer } from '@niscorp/moss';
import type { MossServer, NiscApp } from '@niscorp/moss';
import { buildLyceum } from '@lyceum/app/app';
import { lyceumIdentity } from './identity';
import { lyceumReactions } from './reactions';
import { doorFunctions } from './functions/door.functions';
import { sortingFunctions } from './functions/sorting.functions';
import { devRuntime } from './runtime';
import type { DevRuntime, LyceumRuntime } from './runtime';

// The one composition: lyceum's artifacts, its environment and its code seams
// → the server. Used by the standalone listener, by vite's dev plugin, and by
// the checks — the same boot everywhere.

export type Booted<R extends LyceumRuntime = DevRuntime> = {
  server: MossServer;
  runtime: R;
  app: NiscApp;
  close: () => Promise<void>;
};

// The development boot: in-memory PGlite, reset every time.
export const boot = async (): Promise<Booted> => bootOn(await devRuntime());

// The boot itself, on whatever environment it is handed.
export const bootOn = async <R extends LyceumRuntime>(runtime: R): Promise<Booted<R>> => {
  // The seams reach the server they are part of; it exists once createServer
  // returns, and nothing calls a seam before then.
  let built: MossServer | undefined;
  const server = (): MossServer => {
    if (built === undefined) throw new Error('lyceum: a seam ran before the server was up');
    return built;
  };

  const app = buildLyceum({
    identity: lyceumIdentity,
    functions: (session) => ({ ...doorFunctions(session, server), ...sortingFunctions(session, server) }),
    reactions: lyceumReactions(server),
  });
  built = await createServer(app, runtime);

  return {
    server: built,
    runtime,
    app,
    close: async () => {
      built?.close();
      await runtime.close();
    },
  };
};
