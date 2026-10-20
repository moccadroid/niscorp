import type { PGlite } from '@electric-sql/pglite';
import { createServer } from '@niscorp/moss';
import type { MossServer, NiscApp } from '@niscorp/moss';
import { createIntegrations } from '@niscorp/moss/integrations';
import { buildLyceum } from '@lyceum/app/app';
import { seatsExtension } from '@lyceum/app/attachable';
import { lyceumIdentity } from './identity';
import { lyceumReactions } from './reactions';
import { doorFunctions } from './functions/door.functions';
import { roomFunctions } from './functions/room.functions';
import { mirrorAssistant } from './mirroring';
import { createCensus } from './census';
import { assistantFunctions } from './functions/assistant.functions';
import { lecternFunctions } from './functions/lectern.functions';
import { phoneInputs } from './phone';
import { attachedSeeds } from './attached';
import { buttonFunctions } from './functions/button.functions';
import { resetFunctions } from './functions/reset.functions';
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

export type Booted<R extends LyceumRuntime = DevRuntime> = {
  server: MossServer;
  runtime: R;
  app: NiscApp;
  timing: Timing;
  close: () => Promise<void>;
};

export type BootOptions = { publicUrl?: string; sshAddress?: string; speakerEmail?: string; send?: SendMail };
const DEFAULT_PUBLIC_URL = 'http://localhost:8796';

export const boot = async (db?: PGlite, options: BootOptions = {}): Promise<Booted> => bootOn(await devRuntime(db), options);

export const bootOn = async <R extends LyceumRuntime>(runtime: R, options: BootOptions = {}): Promise<Booted<R>> => {
  const publicUrl = options.publicUrl ?? DEFAULT_PUBLIC_URL;
  let built: MossServer | undefined;
  const server = (): MossServer => {
    if (built === undefined) throw new Error('lyceum: a seam ran before the server was up');
    return built;
  };

  const moderation = startModeration(server, runtime.pool, createModerator(process.env));
  const querier = createQuerier(process.env);
  const timerWriter = createTimerWriter(process.env);
  const orchestrator = createOrchestrator(process.env);
  const tz = talkZone(process.env);
  const census = createCensus();
  const speakerMail = {
    publicUrl,
    speakerEmail: options.speakerEmail ?? process.env['LYCEUM_SPEAKER_EMAIL'] ?? '',
    send: options.send ?? createMailer(process.env, publicUrl),
  };
  const mirror = mirrorAssistant(() => server());
  let timingUp: Timing | undefined;
  const timing = (): Timing => {
    if (timingUp === undefined) throw new Error('lyceum: the timers are not up yet');
    return timingUp;
  };

  // The operator routes are called in-process by the speaker's Integrations
  // tool with this key; it never leaves the server.
  const operatorKey = runtime.operatorKey ?? randomBytes(32).toString('hex');
  const vendor = vendorAddresses(process.env);

  const renderers = followRenderers();
  const integrations = createIntegrations({ extension: seatsExtension });
  const app = buildLyceum({
    features: [integrations],
    identity: lyceumIdentity,
    functions: (session) => [...doorFunctions(session, server, runtime.pool, moderation), ...roomFunctions(session, publicUrl, options.sshAddress ?? '', census), ...assistantFunctions(session, { querier, writer: timerWriter, orchestrator, tz, timing }), ...lecternFunctions(server, speakerMail), ...xrayFunctions(session), ...buttonFunctions(session, server), ...mirror.functions(session), ...resetFunctions(session, server, operatorKey, timing), ...integrationFunctions(session, server, operatorKey, vendor)],
    reactions: [...lyceumReactions(server, moderation), renderers.reaction],
    inputs: phoneInputs(integrations),
    seeds: attachedSeeds(integrations),
    onSession: (session) => {
      renderers.onSession(session);
      mirror.onSession(session);
    },
    components: Object.fromEntries(Object.entries(KIT_PROPS.shape).map(([name, propsSchema]) => [name, { meta: { propsSchema } }])),
  });
  built = await createServer(app, { ...runtime, operatorKey });
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
