import type { PGlite } from '@electric-sql/pglite';
import { createServer } from '@niscorp/moss';
import type { MossServer, NiscApp } from '@niscorp/moss';
import { buildLyceum } from '@lyceum/app/app';
import { lyceumIdentity } from './identity';
import { lyceumReactions } from './reactions';
import { doorFunctions } from './functions/door.functions';
import { assignmentFunctions } from './functions/assignment.functions';
import { roomFunctions } from './functions/room.functions';
import { askFunctions } from './functions/ask.functions';
import { createAsker } from './asking';
import { devRuntime } from './runtime';
import { createIssuer } from './issuer';
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

// Where people open the room — the deployment's address (PUBLIC_URL), which
// the projector shows as a QR code. A boot not told falls back to the
// standalone server's own port on this machine.
export type BootOptions = { publicUrl?: string };
const DEFAULT_PUBLIC_URL = 'http://localhost:8796';

// The development boot: in-memory PGlite — a fresh one, or the one it is lent.
export const boot = async (db?: PGlite, options: BootOptions = {}): Promise<Booted> => bootOn(await devRuntime(db), options);

// The boot itself, on whatever environment it is handed.
export const bootOn = async <R extends LyceumRuntime>(runtime: R, options: BootOptions = {}): Promise<Booted<R>> => {
  const publicUrl = options.publicUrl ?? DEFAULT_PUBLIC_URL;
  // The seams reach the server they are part of; it exists once createServer
  // returns, and nothing calls a seam before then.
  let built: MossServer | undefined;
  const server = (): MossServer => {
    if (built === undefined) throw new Error('lyceum: a seam ran before the server was up');
    return built;
  };

  // Who writes the ID cards — Qwen with a key, the deterministic fake without
  // (./issuer.ts). Read from the environment the process was started with.
  const issuer = createIssuer(process.env);
  // Who routes and writes the answers to the ask — Jev and gpt-oss-120b with
  // keys, the deterministic fake without (./asking.ts).
  const asker = createAsker(process.env);

  const app = buildLyceum({
    identity: lyceumIdentity,
    functions: (session) => ({ ...doorFunctions(session, server, issuer), ...assignmentFunctions(session, server), ...roomFunctions(publicUrl), ...askFunctions(session, asker) }),
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
