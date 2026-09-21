// .env first — TYPESAFE_API_KEY and ENCORE_DECIDER live there. Node's own
// loader, no dependency; a missing file is fine (the fake needs no key).
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { createServer, mintDevToken } from '@niscorp/moss';
import type { MossServer, NiscApp, RunRecord as SpentRun } from '@niscorp/moss';
import { buildEncore } from '@encore/app/app';
import { DIRECTOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { createDirector } from './director/director';
import type { Director } from './director/director';
import { EVENT_PASSES_PER_SECOND, createCeiling } from './watch/ceiling';
import { CATALOG_DEFINITIONS } from '@encore/app/action-catalog';
import { PINNED_CLOCK } from '@encore/lib/festival-clock';
import { createDecider, deciderConfigFromEnv } from './decider/decider';
import type { Decider, DeciderConfig } from './decider/decider';
import { agentConfigFromEnv, createAgentLlm } from './agent/llm';
import type { AgentLlm, AgentLlmConfig } from './agent/llm';
import { traceDirFrom } from './agent/trace-file';
import { createIntentLoops } from './intent/functions';
import type { IntentLoops } from './intent/functions';
import type { PassRecord, RunRecord } from './intent/intent.types';
import type { DecidedPass } from './intent/loop';
import { installWarmDispatcher } from './keep-warm';
import { devRuntime } from './runtime';
import type { DevRuntime } from './runtime';

// The one composition: encore's artifacts, a database and a decision provider
// → the server. Used three ways — the standalone listener, vite's dev plugin
// (in-process, one `pnpm dev`) and the checks (in-process, no port).
//
// Order tells the story:
//   decider  — which provider DECIDES; the fake binds its listener here
//   agent    — which model the AGENT thinks with, or none
//   loops    — the per-session intent loops, closed over that provider
//   server   — moss verifies the charter over the whole or refuses to boot

// Enough to read a session back; not a ledger.
const KEPT_RUNS = 200;

export type BootOptions = {
  // Overrides the environment. The checks pin the fake on a free port so a
  // suite never depends on a key, a network or whatever a dev server holds.
  decider?: Partial<DeciderConfig>;
  agent?: Partial<AgentLlmConfig>;
  // Overrides ENCORE_TRACE_DIR — a check points it at a scratch directory.
  traceDir?: string;
  // The ceiling on event passes per second, and the wall clock the brief's rate
  // limit reads — a check lowers the first and steps the second.
  eventPassesPerSecond?: number;
  now?: () => number;
  onPass?: (principal: string | null, record: PassRecord) => void;
  onRun?: (principal: string | null, record: RunRecord) => void;
  onDecided?: (principal: string | null, decided: DecidedPass) => void;
};

export type Booted = {
  server: MossServer;
  runtime: DevRuntime;
  app: NiscApp;
  decider: Decider;
  agent: AgentLlm;
  intent: IntentLoops;
  // The manifest's `runs` sink: every agent run, as moss stamped it. In
  // process and bounded, on purpose — a lab app's answer to "what did the last
  // few runs cost"; a deployment would persist these through the session's own
  // wire, and the sink is handed the session so that it can.
  spent: () => readonly SpentRun[];
  // The feed. It writes through the server's own door as its own principal; it
  // is here so a host can play it, and so `close` can stop it.
  director: Director;
  // A booted world owns a listener and timers; a hot re-boot and a finished
  // check both have to hand them back.
  close: () => Promise<void>;
};

export const boot = async (options: BootOptions = {}): Promise<Booted> => {
  // Before anything fetches: every provider call in this process — signal's
  // adapters, the Groq SDK — goes through the global dispatcher this installs.
  installWarmDispatcher();
  const decider = await createDecider({ ...deciderConfigFromEnv(process.env), ...options.decider }, process.env);
  const agent = createAgentLlm({ ...agentConfigFromEnv(process.env), ...options.agent }, process.env);
  const traceDir = options.traceDir ?? traceDirFrom(process.env);
  // The director exists before the server it writes to: what it holds is a way
  // to SEND, filled in below. Until then a cue is refused, not lost.
  let sendAsDirector: Parameters<typeof createDirector>[0] = async () => ({ ok: false, status: 503, text: 'the server is not up yet' });
  const director = createDirector((body) => sendAsDirector(body));
  const COMMANDS: Record<string, () => void> = { play: director.play, pause: director.pause, faster: director.faster, slower: director.slower, replay: director.replay };

  const intent = createIntentLoops(
    {
    decider,
    agent,
    ceiling: createCeiling(options.eventPassesPerSecond ?? EVENT_PASSES_PER_SECOND),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(traceDir !== undefined ? { traceDir } : {}),
    clock: PINNED_CLOCK,
    definitions: CATALOG_DEFINITIONS,
    ...(options.onPass !== undefined ? { onPass: options.onPass } : {}),
    ...(options.onRun !== undefined ? { onRun: options.onRun } : {}),
    ...(options.onDecided !== undefined ? { onDecided: options.onDecided } : {}),
    },
    {
      command: (command) => {
        COMMANDS[command]?.();
        return director.state();
      },
    },
  );

  const spent: SpentRun[] = [];
  const runtime = await devRuntime();
  const app = buildEncore(intent, (record) => {
    spent.push(record);
    if (spent.length > KEPT_RUNS) spent.shift();
  });
  const server = await createServer(app, runtime);
  // PRE-WARM, ONCE THE PROCESS IS QUIET. The handshake to the provider is most
  // of a cold pass, so it is paid at boot rather than by whoever types first —
  // but AFTER the database has booted, not beside it: PGlite's start-up holds
  // the event loop for about a second, a warm-up sharing it is measured late and
  // answered late, and a socket opened a second early is a second older when
  // the far end decides it has been idle too long. Fire and forget: a provider
  // that is down fails the first pass loudly enough.
  void decider.warm();

  // THE FEED'S DOOR IS THE FRONT DOOR: the same surface a browser or a curl
  // reaches, with a bearer token for the director's own principal. Its role is
  // what vex checks; nothing in this process trusts it more than a stranger.
  sendAsDirector = async (body) => {
    const response = await server.request('/api/vex', { method: 'POST', headers: { Authorization: `Bearer ${mintDevToken(DIRECTOR_PRINCIPAL)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: response.ok, status: response.status, text: response.ok ? '' : await response.text() };
  };

  return {
    server,
    runtime,
    app,
    decider,
    agent,
    intent,
    spent: () => spent,
    director,
    close: async () => {
      director.close();
      server.socket.stop();
      server.shells?.stop();
      await decider.close();
    },
  };
};
