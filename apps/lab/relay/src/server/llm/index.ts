import type { SignalClient } from '@niscorp/cortex';
import { EFFORT_LABELS, type ReasoningEffort } from './effort';
import { streamViaStep } from './streaming';
import { createGroqClient, getKey as groqKey, GPT_OSS_MODEL, GPT_OSS_SAMPLING, QWEN_MODEL, QWEN_SAMPLING, GROQ_ENV_KEY } from './groq';
import {
  createOpenRouterClient,
  createLunaClient,
  createOxAlphaClient,
  getKey as openRouterKey,
  GLM_MODEL,
  LUNA_MODEL,
  OX_ALPHA_MODEL,
  OPENROUTER_ENV_KEY,
} from './openrouter';

// The assignment is server state, not a per-user preference: a model choice
// spends money and changes what every session gets.

export type ModelId = 'qwen-27b' | 'groq-120b' | 'glm-5.2' | 'ox-alpha' | 'luna';

export type ModelEntry = {
  label: string;
  model: string;
  envKey: string;
  silentWhileReasoning?: boolean;
  efforts: readonly ReasoningEffort[];
  defaultEffort: ReasoningEffort;
  create: (apiKey: string, effort: ReasoningEffort) => SignalClient;
  getKey: () => string | undefined;
};

export const MODELS: Record<ModelId, ModelEntry> = {
  'qwen-27b': {
    label: 'Qwen 3.8 27B · Groq · fast',
    model: QWEN_MODEL,
    envKey: GROQ_ENV_KEY,
    // On Groq the model's own default does not reason before answering; the
    // other rungs do.
    efforts: ['none', 'default', 'low', 'medium', 'high'],
    defaultEffort: 'default',
    create: createGroqClient(QWEN_MODEL, QWEN_SAMPLING),
    getKey: groqKey,
  },
  'groq-120b': {
    label: 'GPT-OSS 120B · Groq · fast',
    model: GPT_OSS_MODEL,
    envKey: GROQ_ENV_KEY,
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'medium',
    create: createGroqClient(GPT_OSS_MODEL, GPT_OSS_SAMPLING),
    getKey: groqKey,
  },
  'glm-5.2': {
    label: 'GLM 5.2 · OpenRouter · paid',
    model: GLM_MODEL,
    envKey: OPENROUTER_ENV_KEY,
    efforts: ['high', 'xhigh'],
    defaultEffort: 'high',
    create: createOpenRouterClient,
    getKey: openRouterKey,
  },
  'ox-alpha': {
    label: 'Ox Alpha · OpenRouter · free, deep, slow',
    model: OX_ALPHA_MODEL,
    envKey: OPENROUTER_ENV_KEY,
    silentWhileReasoning: true,
    // The model's own default is `max`, which overruns the architect's 6m stop.
    efforts: ['low', 'high', 'max'],
    defaultEffort: 'low',
    create: createOxAlphaClient,
    getKey: openRouterKey,
  },
  luna: {
    label: 'GPT-5.6 Luna · OpenRouter · strong, mid-price',
    model: LUNA_MODEL,
    envKey: OPENROUTER_ENV_KEY,
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'medium',
    create: createLunaClient,
    getKey: openRouterKey,
  },
};

export const effortOptionsFor = (model: ModelId): { value: string; label: string }[] =>
  MODELS[model].efforts.map((effort) => ({ value: effort, label: EFFORT_LABELS[effort] }));

export type AgentRole = 'chat' | 'architect' | 'layout' | 'query' | 'shape';

export type AgentEntry = { label: string; runsOn: ModelId; effort?: ReasoningEffort };

export type Assignment = { model: ModelId; effort: ReasoningEffort };

export const AGENTS: Record<AgentRole, AgentEntry> = {
  chat: { label: 'Chat', runsOn: 'groq-120b' },
  layout: { label: 'Chat visualiser', runsOn: 'groq-120b' },
  // High plans the whole screen before it answers; at medium it sends the same screen back after a finding more often.
  architect: { label: 'Screen builder', runsOn: 'groq-120b', effort: 'high' },
  // The two below stay on 120b on purpose: Groq's 250k tokens/minute is per
  // model, and with them on qwen too one build runs past it into 429s.
  query: { label: 'Query writer', runsOn: 'groq-120b' },
  shape: { label: 'Row mapper', runsOn: 'groq-120b' },
};

const assigned = new Map<AgentRole, Assignment>();

const clampEffort = (model: ModelId, effort: ReasoningEffort | undefined): ReasoningEffort =>
  effort !== undefined && MODELS[model].efforts.includes(effort) ? effort : MODELS[model].defaultEffort;

export const assignmentOf = (role: AgentRole): Assignment => {
  const set = assigned.get(role);
  const model = set?.model ?? AGENTS[role].runsOn;
  return { model, effort: clampEffort(model, set?.effort ?? AGENTS[role].effort) };
};

export const modelOf = (role: AgentRole): ModelId => assignmentOf(role).model;

export const assign = (role: AgentRole, model: ModelId, effort?: ReasoningEffort): void => {
  assigned.set(role, { model, effort: clampEffort(model, effort) });
};

// Spelled out rather than folded from Object.keys, so a new role fails to
// build until it is answered here.
export const assignments = (): Record<AgentRole, Assignment> => ({
  chat: assignmentOf('chat'),
  layout: assignmentOf('layout'),
  architect: assignmentOf('architect'),
  query: assignmentOf('query'),
  shape: assignmentOf('shape'),
});

export const isRole = (value: unknown): value is AgentRole =>
  typeof value === 'string' && Object.hasOwn(AGENTS, value);

export const isModelId = (value: unknown): value is ModelId =>
  typeof value === 'string' && Object.hasOwn(MODELS, value);

export const isEffort = (value: unknown): value is ReasoningEffort =>
  typeof value === 'string' && Object.hasOwn(EFFORT_LABELS, value);

export type AgentLlm = { llm: SignalClient } | { error: string };

export const llmFor = (role: AgentRole): AgentLlm => {
  const { model, effort } = assignmentOf(role);
  const entry = MODELS[model];
  const key = entry.getKey();
  if (key === undefined)
    return { error: `${AGENTS[role].label} runs on ${entry.label}, which needs ${entry.envKey} in the server's .env.` };
  const llm = entry.create(key, effort);
  return { llm: entry.silentWhileReasoning === true ? streamViaStep(llm) : llm };
};

export type { ReasoningEffort } from './effort';
