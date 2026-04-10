// ═══════════════════════════════════════════════════════════
// Context engineering types
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5. The producer model is the heart of Cortex.
// These types are deliberately hand-written rather than Zod-derived
// (STYLE_GUIDE §Types: hand-written for function-parameter bags
// and runtime state — exactly this case).

import type { ContentChunk, ContentPart, Observation } from '../schemas';
import type { BudgetState, BusEvent } from '../types';

// ───────────────────────────────────────────────────────────
// Producer state (private to a producer, scoped per-workflow)
// ───────────────────────────────────────────────────────────

export type ProducerState = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  has: (key: string) => boolean;
  flag: (key: string) => void;
  delete: (key: string) => void;
  // Snapshot for inspection / debugging.
  toObject: () => Record<string, unknown>;
};

// ───────────────────────────────────────────────────────────
// Read-only registry view exposed to producers
// ───────────────────────────────────────────────────────────

export type RegistryAgentView = {
  id: string;
  name: string;
  description: string;
  outputMode: 'text' | 'structured' | 'plan';
};

export type RegistryToolView = {
  id: string;
  name: string;
  description: string;
  category?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  inputSchema: unknown;
};

export type ReadonlyRegistry = {
  listAgents: () => ReadonlyArray<RegistryAgentView>;
  listTools: () => ReadonlyArray<RegistryToolView>;
  getAgent: (id: string) => RegistryAgentView | undefined;
  getTool: (id: string) => RegistryToolView | undefined;
};

// ───────────────────────────────────────────────────────────
// BuildContext — what producers see when asked to build
// ───────────────────────────────────────────────────────────

export type BuildContext = {
  agentId: string;
  workflowId: string;
  tick: number;
  input: unknown;
  observations: ReadonlyArray<Observation>;
  registry: ReadonlyRegistry;
  state: ReadonlyMap<string, unknown>;
  budget: BudgetState;
};

// ───────────────────────────────────────────────────────────
// Compressor — opt-in shrinking of a producer's chunks
// ───────────────────────────────────────────────────────────

export type Compressor = (
  chunks: ReadonlyArray<ContentChunk>,
  targetTokens: number,
) => Promise<ContentChunk[]>;

// ───────────────────────────────────────────────────────────
// ContextProducer — the primitive
// ───────────────────────────────────────────────────────────

export type ContextProducer = {
  id: string;
  /**
   * 0 = most evictable, 100 = pinned (never evicted).
   * Producers tied to required content (system prompt, action contract,
   * input) should be 100. Cosmetic / debug producers should be low.
   */
  priority: number;
  /**
   * Optional bus topic patterns. If set, this producer is also an
   * interceptor: the runtime attaches it to the bus on workflow start
   * and detaches on workflow end. Use onEvent to accumulate state
   * that build() then turns into chunks.
   */
  subscribes?: string[];
  /**
   * Optional per-producer hard token cap. The pipeline compresses
   * (or evicts) this producer's chunks down to maxTokens before
   * applying global budget rules.
   */
  maxTokens?: number;
  build: (ctx: BuildContext) => Promise<ContentChunk[]> | ContentChunk[];
  compress?: Compressor;
  onEvent?: (event: BusEvent, state: ProducerState) => void;
};

// ───────────────────────────────────────────────────────────
// ContextSpec — attached to AgentConfig
// ───────────────────────────────────────────────────────────

export type ContextSpec = {
  producers: ContextProducer[];
  /**
   * Hard global token budget for the pack. If unset, the pipeline
   * uses the manifold's defaultPackBudget (or 32_000 as a final fallback).
   */
  budgetTokens?: number;
};

// ───────────────────────────────────────────────────────────
// Resolved pack — what previewContext returns and what the
// tool loop sends to Signal
// ───────────────────────────────────────────────────────────

export type ResolvedChunk = ContentChunk & {
  evicted: boolean;
  reason?: string;
};

export type ResolvedContext = {
  chunks: ReadonlyArray<ResolvedChunk>;
  totalTokens: number;
  budget: number;
  estimatedCost?: number;
};

// Helper for producers that need to emit ContentPart unions.
export type { ContentChunk, ContentPart, Observation };
