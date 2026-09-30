import type { PGlite } from '@electric-sql/pglite';
import { createServer } from '@niscorp/moss';
import type { MossServer, NiscApp } from '@niscorp/moss';
import { buildLyceum } from '@lyceum/app/app';
import { lyceumIdentity } from './identity';
import { lyceumReactions } from './reactions';
import { doorFunctions } from './functions/door.functions';
import { roomFunctions } from './functions/room.functions';
import { createCensus } from './census';
import { assistantFunctions } from './functions/assistant.functions';
import { lecternFunctions } from './functions/lectern.functions';
import { phoneInputs } from './phone';
import { xrayFunctions } from './functions/xray.functions';
import { followRenderers } from './renderers';
import { integrationFunctions, vendorAddresses } from './functions/integration.functions';
import { randomBytes } from 'node:crypto';
import { KIT_PROPS } from '@lyceum/ui/kit.props';
import { createMailer } from './mail';
import type { SendMail } from './mail';
import { createTimerWriter, startTiming, talkZone } from './timing';
import { createOrchestrator } from './assistant/orchestrator';
import type { Timing } from './timing';
import { createQuerier } from './querying';
import { devRuntime } from './runtime';
import { createModerator, startModeration } from './moderation';
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
//
// Who the speaker is and how their sign-in link is sent: the speaker's address
// (LYCEUM_SPEAKER_EMAIL unless told) and a mailer (./mail.ts unless told — a
// check hands in an outbox).
//
// How people reach the SSH door from outside, as the command they type — the
// deployment's (LYCEUM_SSH_ADDRESS; a proxy picks the host and port, not the
// app). Empty: the projector does not show one.
export type BootOptions = { publicUrl?: string; sshAddress?: string; speakerEmail?: string; send?: SendMail };
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

  // Whether what people write may be shown — the one decider with a key, the
  // deterministic fake without (./moderation.ts) — and the moderator at work:
  // names at the door, questions as they arrive.
  const moderation = startModeration(server, runtime.pool, createModerator(process.env));
  // Who routes requests to queries and writes new ones — Jev and gpt-oss-120b with
  // keys, the deterministic fake without (./querying.ts).
  const querier = createQuerier(process.env);
  // Who writes the speaker's timers — the reflex agent with a key, the
  // deterministic fake without (./timing.ts) — and where the talk's clocks are.
  const timerWriter = createTimerWriter(process.env);
  // The one assistant's turn — gpt-oss-120b with a key, the deterministic
  // stand-in without (./assistant/orchestrator.ts).
  const orchestrator = createOrchestrator(process.env);
  const tz = talkZone(process.env);
  // How big the app is, counted from its source once for this server (./census.ts).
  const census = createCensus();
  const speakerMail = {
    publicUrl,
    speakerEmail: options.speakerEmail ?? process.env['LYCEUM_SPEAKER_EMAIL'] ?? '',
    send: options.send ?? createMailer(process.env, publicUrl),
  };
  let timingUp: Timing | undefined;
  const timing = (): Timing => {
    if (timingUp === undefined) throw new Error('lyceum: the timers are not up yet');
    return timingUp;
  };

  // The operator routes (installing an integration) are called in-process by
  // the speaker's Integrations tool with this key; it never leaves the server.
  const operatorKey = runtime.operatorKey ?? randomBytes(32).toString('hex');
  const vendor = vendorAddresses(process.env);

  const renderers = followRenderers();
  const app = buildLyceum({
    identity: lyceumIdentity,
    functions: (session) => ({ ...doorFunctions(session, server, moderation), ...roomFunctions(session, publicUrl, options.sshAddress ?? '', census), ...assistantFunctions(session, { querier, writer: timerWriter, orchestrator, tz, timing }), ...lecternFunctions(server, speakerMail), ...xrayFunctions(session), ...integrationFunctions(session, server, operatorKey, vendor) }),
    reactions: [...lyceumReactions(server, moderation), renderers.reaction],
    inputs: phoneInputs,
    onSession: renderers.onSession,
    components: Object.fromEntries(Object.entries(KIT_PROPS.shape).map(([name, propsSchema]) => [name, { meta: { propsSchema } }])),
  });
  built = await createServer(app, { ...runtime, operatorKey });
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
