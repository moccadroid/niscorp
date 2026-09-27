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
import { assistantFunctions } from './functions/assistant.functions';
import { createTimerWriter, startTiming, talkZone } from './timing';
import { createOrchestrator } from './assistant/orchestrator';
import type { Timing } from './timing';
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
  // The talk's timers: tide, its driver, and reloading the saved ones.
  timing: Timing;
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
  // Who writes the speaker's timers — the reflex agent with a key, the
  // deterministic fake without (./timing.ts) — and where the talk's clocks are.
  const timerWriter = createTimerWriter(process.env);
  // The one assistant's turn — gpt-oss-120b with a key, the deterministic
  // stand-in without (./assistant/orchestrator.ts).
  const orchestrator = createOrchestrator(process.env);
  const tz = talkZone(process.env);
  let timingUp: Timing | undefined;
  const timing = (): Timing => {
    if (timingUp === undefined) throw new Error('lyceum: the timers are not up yet');
    return timingUp;
  };

  const app = buildLyceum({
    identity: lyceumIdentity,
    functions: (session) => ({ ...doorFunctions(session, server, issuer), ...assignmentFunctions(session, server), ...roomFunctions(publicUrl), ...askFunctions(session, asker), ...assistantFunctions(session, { asker, writer: timerWriter, orchestrator, tz, timing }) }),
    reactions: lyceumReactions(server),
  });
  built = await createServer(app, runtime);
  // Tide stands on the server it writes through, so it starts once that is up
  // — loading every timer saved before this boot.
  timingUp = await startTiming(built, runtime);

  return {
    server: built,
    runtime,
    app,
    timing: timingUp,
    close: async () => {
      await timingUp?.stop();
      built?.close();
      await runtime.close();
    },
  };
};
