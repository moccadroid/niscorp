import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { FAKE_AGENT_MODEL, createScriptedClient } from './fake-llm';
import type { FakeAgentControls } from './fake-llm';

export type AgentKind = 'groq' | 'fake' | 'off';

export type AgentLlm = {
  kind: AgentKind;
  id: string;
  model: string;
  label: string;
  llm: SignalClient | undefined;
};

export type AgentLlmConfig = {
  kind: AgentKind;
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
    if ((env['GROQ_API_KEY'] ?? '') === '') throw new Error('encore: ENCORE_AGENT=groq needs GROQ_API_KEY in apps/lab/encore/.env.');
    // `'default'` is Qwen's own default on Groq, which does not reason before answering.
    const llm = createSignal('groq', { options: { temperature: 0, reasoningEffort: 'default' } });
    const model = llm.describe().model ?? '';
    return { kind: 'groq', id: 'groq', model, label: model.split('-').at(-1) ?? 'groq', llm };
  }

  return {
    kind: 'fake',
    id: 'fake',
    model: FAKE_AGENT_MODEL,
    label: 'scripted',
    // `validatesToolArgs` is Groq's, so the envelope resolves to `emit` as it does in production.
    llm: createSignal(
      {
        baseUrl: 'http://127.0.0.1:0/v1',
        apiKey: 'encore-dev',
        model: FAKE_AGENT_MODEL,
        adapter: 'openai-compatible',
        capabilities: { nativeTools: true, nativeJsonMode: true, validatesToolArgs: true, nativeJsonSchema: true, manglesNestedToolArgs: false, multimodal: true },
      },
      { client: createScriptedClient(config.fake), options: { temperature: 0, reasoningEffort: 'default' } },
    ),
  };
};
