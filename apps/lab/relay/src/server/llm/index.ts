import type { SignalClient } from '@niscorp/cortex';
import { EFFORT_LABELS, type ReasoningEffort } from './effort';
import { streamViaStep } from './streaming';
import { createGroqClient, getKey as groqKey, GROQ_MODEL, GROQ_ENV_KEY } from './groq';
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

// ═══════════════════════════════════════════════════════════
// The LLM seam — which MODEL each agent runs on.
//
// Two rosters and one assignment between them. MODELS is what relay can run:
// each entry owns its adapter and its own .env variable, so two providers' keys
// never collide. AGENTS is every agent in the app — the chat, the screen builder
// and its reviewer, the visualiser, and the reference agents the data layer
// calls — each with the model it runs on until someone says otherwise.
//
// Call sites ask for a ROLE and never name a model: `llmFor('chat')`. Adding a
// model is one MODELS entry; moving an agent is one word in AGENTS.
//
// The assignment is SERVER state, not a per-user preference: a model choice
// spends money and changes what every session gets, so it belongs to the
// deployment, not to whoever opened Settings. Settings → Models edits it live
// (server/functions/models.ts); a restart returns to the defaults below, which
// are the code's own opinion. Keys stay .env — agents run inside moss and
// nothing LLM-shaped reaches a browser.
// ═══════════════════════════════════════════════════════════

export type ModelId = 'groq-120b' | 'glm-5.2' | 'ox-alpha' | 'luna';

export type ModelEntry = {
  // The one line a chooser reads in the dropdown: what it is, whose endpoint,
  // and the trade that decides it. A dropdown has no room for a second line.
  label: string;
  // The provider's own id, and the variable its key comes from.
  model: string;
  envKey: string;
  // Does this model go QUIET on the wire while it reasons? A streamed call to
  // one of those idles out and the provider hangs up, so its client answers a
  // stream with a single step instead (./streaming.ts). Measured, per model.
  silentWhileReasoning?: boolean;
  // The reasoning rungs THIS model accepts, verified against the live API, and
  // the one it runs at unless an agent says otherwise. Ordered cheapest-first;
  // Settings offers exactly this list for whichever model a row is on.
  efforts: readonly ReasoningEffort[];
  defaultEffort: ReasoningEffort;
  create: (apiKey: string, effort: ReasoningEffort) => SignalClient;
  getKey: () => string | undefined;
};

export const MODELS: Record<ModelId, ModelEntry> = {
  'groq-120b': {
    label: 'GPT-OSS 120B · Groq · fast',
    model: GROQ_MODEL,
    envKey: GROQ_ENV_KEY,
    // Groq's own default for gpt-oss is medium, so the default here sends what
    // the model already did before any of this was settable.
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'medium',
    create: createGroqClient,
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
    // Observed 2026-08-22: a build streamed on this model died at 7m32s with
    // "Provider stream error: Upstream idle timeout exceeded" — it emits
    // nothing while thinking, so the connection goes idle and OpenRouter cuts it.
    silentWhileReasoning: true,
    // Its own default is `max`, which overran the architect's 6m stop. `low`
    // is the measured rung that fits the loop.
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

// The rungs a model offers, as Settings renders them.
export const effortOptionsFor = (model: ModelId): { value: string; label: string }[] =>
  MODELS[model].efforts.map((effort) => ({ value: effort, label: EFFORT_LABELS[effort] }));

export type AgentRole = 'chat' | 'architect' | 'validator' | 'layout' | 'mapping' | 'query' | 'shape';

// `label` is for SERVER prose (the missing-key message names the agent). The
// settings screen writes its own copy — a layout is an authored artifact, not a
// render of this table.
export type AgentEntry = { label: string; runsOn: ModelId; effort?: ReasoningEffort };

// What an agent runs on: a model, and how hard it thinks on it. Effort is
// stored per AGENT, not per model — the same model can reason hard for the
// screen builder and cheaply for the row mapper.
export type Assignment = { model: ModelId; effort: ReasoningEffort };

export const AGENTS: Record<AgentRole, AgentEntry> = {
  // Ray in the panel, and the caller of every tool below it.
  chat: { label: 'Chat', runsOn: 'groq-120b' },
  // `visualize` — the last query result, rendered as a layout in the chat.
  layout: { label: 'Chat visualiser', runsOn: 'groq-120b' },
  // Designs a whole screen from a description and mounts it to check itself.
  //
  // BACK ON 120b, 2026-08-22. Ox Alpha was made the default on one green run and
  // it did not hold: builds came back with malformed ActionDefinitions — props
  // hoisted out of `props`, whole definitions nested inside `endpoints` — and
  // burned their step budget re-submitting them to `run_action`. Two changes
  // went in together and neither was measured over a suite: `low` reasoning
  // effort, and capability overrides that move the output off the content
  // channel onto tool arguments. The pipeline's budgets and producers were
  // tuned against 120b; that is the floor until a bench run says otherwise.
  // Ox Alpha is one dropdown away in Settings → Models.
  architect: { label: 'Screen builder', runsOn: 'groq-120b' },
  // Reads a built screen against the intent; its findings are the repair.
  validator: { label: 'Screen reviewer', runsOn: 'groq-120b' },
  // Prism: the config that maps one shape into another.
  mapping: { label: 'Transform writer', runsOn: 'groq-120b' },
  // Vex: a request becomes query DSL when no cached shape matches.
  query: { label: 'Query writer', runsOn: 'groq-120b' },
  // Vex: the rows a query returned, mapped onto the shape asked for.
  shape: { label: 'Row mapper', runsOn: 'groq-120b' },
};

// The live overrides. Empty means every agent is on its declared default —
// which is why those defaults have to be the honest ones, not a leftover.
const assigned = new Map<AgentRole, Assignment>();

// An effort only means something on the model it was set for, so a rung the
// model does not offer falls back to that model's default rather than being
// sent and rejected. This is what makes switching a row's model safe: the
// effort clamps instead of going stale.
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

// Spelled out rather than folded from Object.keys: a loop can't prove to the
// compiler that it covered the union, and this way a new role fails to build
// until it is answered here.
export const assignments = (): Record<AgentRole, Assignment> => ({
  chat: assignmentOf('chat'),
  layout: assignmentOf('layout'),
  architect: assignmentOf('architect'),
  validator: assignmentOf('validator'),
  mapping: assignmentOf('mapping'),
  query: assignmentOf('query'),
  shape: assignmentOf('shape'),
});

// Ids arriving from the wire are strings until proven otherwise.
export const isRole = (value: unknown): value is AgentRole =>
  typeof value === 'string' && Object.hasOwn(AGENTS, value);

export const isModelId = (value: unknown): value is ModelId =>
  typeof value === 'string' && Object.hasOwn(MODELS, value);

export const isEffort = (value: unknown): value is ReasoningEffort =>
  typeof value === 'string' && Object.hasOwn(EFFORT_LABELS, value);

// A client for the role, or the reason there isn't one — written for whoever
// reads it in the chat: which agent, which model, which variable is missing.
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
