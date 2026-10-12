try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { createServer, mintDevToken } from '@niscorp/moss';
import type { MossServer, NiscApp, RunRecord as SpentRun } from '@niscorp/moss';
import type { ScopePolicy } from '@niscorp/vex';
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

const KEPT_RUNS = 200;

export type BootOptions = {
  decider?: Partial<DeciderConfig>;
  agent?: Partial<AgentLlmConfig>;
  traceDir?: string;
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
  spent: () => readonly SpentRun[];
  director: Director;
  close: () => Promise<void>;
};

export const boot = async (options: BootOptions = {}): Promise<Booted> => {
  installWarmDispatcher();
  const decider = await createDecider({ ...deciderConfigFromEnv(process.env), ...options.decider }, process.env);
  const agent = createAgentLlm({ ...agentConfigFromEnv(process.env), ...options.agent }, process.env);
  const traceDir = options.traceDir ?? traceDirFrom(process.env);
  let sendAsDirector: Parameters<typeof createDirector>[0] = async () => ({ ok: false, status: 503, text: 'the server is not up yet' });
  const director = createDirector((body) => sendAsDirector(body));
  const COMMANDS: Record<string, () => void> = { play: director.play, pause: director.pause, faster: director.faster, slower: director.slower, replay: director.replay };

  let policyFor: (roles: readonly string[]) => ScopePolicy = () => {
    throw new Error('encore: a session asked what it may read before the server was up');
  };

  const intent = createIntentLoops(
    {
    decider,
    policyFor: (roles) => policyFor(roles),
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
  policyFor = server.policyForRoles;
  // After the database has booted: PGlite's start-up holds the event loop for about a second.
  void decider.warm();

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
      server.close();
      await decider.close();
    },
  };
};
