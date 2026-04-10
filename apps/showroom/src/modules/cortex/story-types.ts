// ═══════════════════════════════════════════════════════════
// Cortex story shapes
// ═══════════════════════════════════════════════════════════
//
// Each story is a Cortex feature demo. Stories are grouped in the
// sidebar by `kind` (the Cortex feature being shown off — "standalone
// execution", "tool use", "plan mode") and discriminated for the
// runner by `demo` (the specific demo within the kind).
//
// Naming rule: `kind` describes Cortex, `demo` describes the example.
// "Prism mapping" is a `demo`, not a `kind` — it falls under the
// `standalone` kind because it shows off Cortex's standalone-mode
// structured agent execution.

import type { JsonObject, JsonValue, Config } from '@niscorp/prism';
import type { ZodType } from 'zod';
import type { PolicyConfig, ToolDefinition, AgentDefinition } from '@niscorp/cortex';

// ───────────────────────────────────────────────────────────
// Cortex feature groups (kinds)
// ───────────────────────────────────────────────────────────

export type CortexKind = 'standalone' | 'tool-use' | 'plan-mode';

// ───────────────────────────────────────────────────────────
// Base shape
// ───────────────────────────────────────────────────────────

type CortexStoryBase = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: CortexKind;
};

// ───────────────────────────────────────────────────────────
// STANDALONE — runAgentStandalone, single LLM call (or call+retry)
// ───────────────────────────────────────────────────────────

// Demo: Prism mapping. Cortex's structured output mode validates an
// agent envelope whose `config` field embeds Prism's ConfigSchema.
// What we're showing off: deep-schema validation + auto-retry, not Prism.
export type PrismMappingStory = CortexStoryBase & {
  kind: 'standalone';
  demo: 'prism-mapping';
  sampleInput: JsonObject;
  expected: JsonValue;
  fieldDescriptions?: Record<string, string>;
  notes?: string;
};

// Demo: generic structured extractor. A passage of text in, a typed
// JSON object out (no Prism). Most common Cortex use case.
export type StructuredExtractStory = CortexStoryBase & {
  kind: 'standalone';
  demo: 'structured-extract';
  // The story owns its agent + schema so each story can have its own
  // shape without us hardcoding a registry.
  agent: AgentDefinition<unknown>;
  inputText: string;
  // Optional: expected substring matches in the result, for the demo's
  // pass/fail badge. Loose because LLM outputs vary.
  expectedFields?: Record<string, string | number>;
};

// ───────────────────────────────────────────────────────────
// TOOL USE — Cortex tool loop, with or without policy enforcement
// ───────────────────────────────────────────────────────────

export type ToolUseStory = CortexStoryBase & {
  kind: 'tool-use';
  demo: 'tool-use';
  // The agent + the tools registered for this run. The story owns
  // both so adding a new tool-use demo is one new file in agents/.
  agent: AgentDefinition<unknown>;
  tools: ReadonlyArray<ToolDefinition>;
  prompt: string;
  // If set, this run is expected to be denied by the policy gate.
  // Renders the result as a green "policy denied as expected" badge
  // when the gate fires, red otherwise.
  expectPolicyDenial?: boolean;
  // Optional policy override applied via the standalone helper's
  // `manifold.defaultBudget` — used by the budget-fail demo.
  budget?: {
    maxTokens?: number;
    maxToolCalls?: number;
    maxTicks?: number;
  };
};

// ───────────────────────────────────────────────────────────
// PLAN MODE — Cortex plan executor + tick loop
// ───────────────────────────────────────────────────────────

export type PlanModeStory = CortexStoryBase & {
  kind: 'plan-mode';
  demo: 'plan-mode';
  // The plan-mode agent (outputMode: 'plan'). May reference tools
  // and other agents via the tools / specialists fields.
  agent: AgentDefinition<unknown>;
  tools?: ReadonlyArray<ToolDefinition>;
  // Specialists this plan-mode agent can ask_agent into. They get
  // registered on the same manifold so the director can find them.
  specialists?: ReadonlyArray<AgentDefinition<unknown>>;
  prompt: string;
};

// ───────────────────────────────────────────────────────────
// Discriminated union + guards
// ───────────────────────────────────────────────────────────

export type CortexStory =
  | PrismMappingStory
  | StructuredExtractStory
  | ToolUseStory
  | PlanModeStory;

export const isCortexStory = (value: unknown): value is CortexStory => {
  if (value === null || typeof value !== 'object') return false;
  if (!('id' in value) || !('name' in value) || !('description' in value)) return false;
  if (!('category' in value) || !('kind' in value) || !('demo' in value)) return false;
  if (typeof Reflect.get(value, 'id') !== 'string') return false;
  if (typeof Reflect.get(value, 'name') !== 'string') return false;
  if (typeof Reflect.get(value, 'description') !== 'string') return false;
  if (typeof Reflect.get(value, 'category') !== 'string') return false;
  return true;
};

export const isPrismMappingStory = (value: unknown): value is PrismMappingStory =>
  isCortexStory(value) && Reflect.get(value, 'demo') === 'prism-mapping';

export const isStructuredExtractStory = (value: unknown): value is StructuredExtractStory =>
  isCortexStory(value) && Reflect.get(value, 'demo') === 'structured-extract';

export const isToolUseStory = (value: unknown): value is ToolUseStory =>
  isCortexStory(value) && Reflect.get(value, 'demo') === 'tool-use';

export const isPlanModeStory = (value: unknown): value is PlanModeStory =>
  isCortexStory(value) && Reflect.get(value, 'demo') === 'plan-mode';

// Re-export types that the runners need.
export type { Config, JsonValue, JsonObject, ZodType, PolicyConfig };
