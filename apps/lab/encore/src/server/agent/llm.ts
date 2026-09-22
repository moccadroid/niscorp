import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { FAKE_AGENT_MODEL, createScriptedClient } from './fake-llm';
import type { FakeAgentControls } from './fake-llm';

// WHICH MODEL THE AGENT THINKS WITH, chosen once at boot — the slow speed's
// twin of decider.ts.
//
//   ENCORE_AGENT=groq   Groq's gpt-oss-120b through signal; needs GROQ_API_KEY
//   ENCORE_AGENT=fake   the scripted client, deterministic and offline
//   ENCORE_AGENT=off    no agent
//
// Unset, it is `groq` when there is a key and `off` when there is not — so a
// fresh checkout runs the fast speed alone and says so, rather than failing on
// a key nobody was told about.
//
// OFF IS NOT ABSENT. The context questions are still asked in every pass and
// still traced, and every finished sentence is still a turn in the thread. Only
// the run, and the card that announces it, do not exist.

export type AgentKind = 'groq' | 'fake' | 'off';

export type AgentLlm = {
  kind: AgentKind;
  id: string;
  model: string;
  // What a card it opened is tagged with — short enough for a card header:
  // `120b`, not `openai/gpt-oss-120b`.
  label: string;
  // Absent exactly when `kind` is 'off'.
  llm: SignalClient | undefined;
};

export type AgentLlmConfig = {
  kind: AgentKind;
  // The fake's knobs — held by reference, so a check can change its script and
  // pacing between sentences. Ignored by the other kinds.
  fake: FakeAgentControls;
};

const numberFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value === undefined || value === '' || Number.isNaN(parsed) ? fallback : parsed;
};

const kindFrom = (env: Record<string, string | undefined>): AgentKind => {
  const asked = env['ENCORE_AGENT'];
  if (asked === 'groq' || asked === 'fake' || asked === 'off') return asked;
  return (env['GROQ_API_KEY'] ?? '') === '' ? 'off' : 'groq';
};

export const agentConfigFromEnv = (env: Record<string, string | undefined>): AgentLlmConfig => ({
  kind: kindFrom(env),
  fake: { latencyMs: numberFrom(env['ENCORE_AGENT_LATENCY_MS'], 0), chunkMs: numberFrom(env['ENCORE_AGENT_CHUNK_MS'], 0), seen: [] },
});

export const createAgentLlm = (config: AgentLlmConfig, env: Record<string, string | undefined>): AgentLlm => {
  if (config.kind === 'off') return { kind: 'off', id: 'off', model: '', label: '', llm: undefined };

  if (config.kind === 'groq') {
    // Asking for Groq without a key is refused rather than quietly served by
    // nothing: somebody waiting for an answer should learn why none is coming
    // at boot, not by watching a card stay pending.
    if ((env['GROQ_API_KEY'] ?? '') === '') throw new Error('encore: ENCORE_AGENT=groq needs GROQ_API_KEY in apps/lab/encore/.env.');
    // Three settings, each one a scar from another app on this exact model
    // (DESIGN.md § What was studied first):
    //
    //   temperature 0       the provider default made one prompt a 3-tool run
    //                       on Monday and a 20-step wander on Tuesday;
    //   reasoningEffort     `low` broke multi-step flows — it answered before
    //   medium              reading the tool result it had just asked for;
    //   no strategy pinned  signal resolves `emit` from the registry's
    //                       `manglesNestedToolArgs`, and must be left to.
    //
    // signal's registry default for Groq is gpt-oss-120b; read back rather than
    // restated, so the trace names whatever the registry actually resolves.
    const llm = createSignal('groq', { options: { temperature: 0, reasoningEffort: 'medium' } });
    const model = llm.describe().model ?? '';
    return { kind: 'groq', id: 'groq', model, label: model.split('-').at(-1) ?? 'groq', llm };
  }

  return {
    kind: 'fake',
    id: 'fake',
    model: FAKE_AGENT_MODEL,
    label: 'scripted',
    // A custom openai-compatible provider whose SDK client is the script. The
    // base URL is never dialled — the injected client answers instead.
    //
    // It declares GROQ'S temperament, so everything above the client resolves
    // as it will in production: `manglesNestedToolArgs` puts the envelope on
    // the content channel (`emit`), the schema rides the prompt as a document,
    // and a check that reads `agent.preview()` is reading the prompt Groq gets.
    llm: createSignal(
      {
        baseUrl: 'http://127.0.0.1:0/v1',
        apiKey: 'encore-dev',
        model: FAKE_AGENT_MODEL,
        adapter: 'openai-compatible',
        capabilities: { nativeTools: true, nativeJsonMode: true, validatesToolArgs: true, manglesNestedToolArgs: true },
      },
      { client: createScriptedClient(config.fake), options: { temperature: 0, reasoningEffort: 'medium' } },
    ),
  };
};
