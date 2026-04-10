// ═══════════════════════════════════════════════════════════
// ActionPlan schema — output of plan-mode agents
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §7.1. Discriminated union over plan-node kinds.
// Every field carries .describe() because the LLM reads this schema.
//
// PlanNode is recursive (parallel.steps contains PlanNode[]). z.lazy
// is used for the recursive reference.

import { z } from 'zod';

// Metadata that may appear on any node.
const ActionMetaSchema = z.object({
  idempotencyKey: z
    .string()
    .optional()
    .describe('Deduplication key for retries. Include for write operations and external side effects.'),
  timeoutMs: z
    .number()
    .positive()
    .optional()
    .describe('Maximum execution time in ms. Runtime cancels and returns a timeout observation if exceeded.'),
  priority: z.enum(['low', 'normal', 'high']).optional().describe('Scheduling hint for the runtime.'),
  tags: z.array(z.string()).optional().describe('Routing and analytics tags.'),
}).partial();

// JSON value used for tool args, payloads, etc. — kept loose because
// each tool defines its own input schema. The agent's output is checked
// against this loose shape, then the tool's own schema validates further.
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

// ───────────────────────────────────────────────────────────
// Node kinds
// ───────────────────────────────────────────────────────────

const UseToolNodeSchema = z
  .object({
    kind: z.literal('use_tool').describe('Invoke a registered tool by id.'),
    toolId: z.string().describe('Tool id exactly as registered with the manifold.'),
    input: JsonValueSchema.describe("Arguments matching the tool's input schema."),
    as: z.string().optional().describe('Store the tool result under this name in observations.'),
    comment: z.string().optional().describe('Your reasoning. Not executed.'),
  })
  .extend(ActionMetaSchema.shape);

const AskAgentNodeSchema = z
  .object({
    kind: z.literal('ask_agent').describe('Delegate to another agent and await the response.'),
    agentId: z.string().describe('Agent id exactly as registered.'),
    input: JsonValueSchema.describe('Input payload for the target agent.'),
    as: z.string().optional().describe('Store the agent result under this name in observations.'),
    comment: z.string().optional(),
  })
  .extend(ActionMetaSchema.shape);

const TellTopicNodeSchema = z
  .object({
    kind: z.literal('tell_topic').describe('Publish an event. Fire and forget — no response expected.'),
    topic: z.string().describe('Event topic to publish to.'),
    payload: JsonValueSchema.optional().describe('Event payload.'),
    comment: z.string().optional(),
  })
  .extend(ActionMetaSchema.shape);

const WaitNodeSchema = z
  .object({
    kind: z.literal('wait').describe('Block until a topic event fires or a timeout elapses.'),
    topic: z.string().describe('Topic pattern to wait for.'),
    timeoutMs: z.number().positive().optional().describe('Wait timeout in ms.'),
    as: z.string().optional(),
    comment: z.string().optional(),
  })
  .extend(ActionMetaSchema.shape);

// Hand-written discriminated union for PlanNode. Zod can't infer
// recursive types from z.lazy in a way that survives bundlers, so
// we declare the type by hand and tell Zod that's what the schema
// produces. The runtime validation still uses the discriminated
// union below.
export type PlanNodeMeta = {
  idempotencyKey?: string;
  timeoutMs?: number;
  priority?: 'low' | 'normal' | 'high';
  tags?: ReadonlyArray<string>;
};

export type UseToolNode = PlanNodeMeta & {
  kind: 'use_tool';
  toolId: string;
  input: unknown;
  as?: string;
  comment?: string;
};

export type AskAgentNode = PlanNodeMeta & {
  kind: 'ask_agent';
  agentId: string;
  input: unknown;
  as?: string;
  comment?: string;
};

export type TellTopicNode = PlanNodeMeta & {
  kind: 'tell_topic';
  topic: string;
  payload?: unknown;
  comment?: string;
};

export type WaitNode = PlanNodeMeta & {
  kind: 'wait';
  topic: string;
  timeoutMs?: number;
  as?: string;
  comment?: string;
};

export type ParallelNode = PlanNodeMeta & {
  kind: 'parallel';
  branches: PlanNode[];
  maxConcurrency?: number;
  comment?: string;
};

export type ReflectNode = {
  kind: 'reflect';
  content: string;
  scope?: 'scratch' | 'workflow' | 'persistent';
  comment?: string;
};

export type FinalNode = {
  kind: 'final';
  result: unknown;
  comment?: string;
};

export type PlanNode =
  | UseToolNode
  | AskAgentNode
  | TellTopicNode
  | WaitNode
  | ParallelNode
  | ReflectNode
  | FinalNode;

export type ActionPlan = PlanNode[];

// Recursive Zod schema. We declare the type to ZodType<PlanNode> so
// the inferred type from z.array(PlanNodeSchema) lines up with the
// hand-written ActionPlan type above.
const PlanNodeSchema: z.ZodType<PlanNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    UseToolNodeSchema,
    AskAgentNodeSchema,
    TellTopicNodeSchema,
    WaitNodeSchema,
    ParallelNodeSchema,
    ReflectNodeSchema,
    FinalNodeSchema,
  ]),
) as z.ZodType<PlanNode>;

const ParallelNodeSchema = z
  .object({
    kind: z.literal('parallel').describe('Execute multiple actions concurrently.'),
    branches: z.array(PlanNodeSchema).describe('Actions to run in parallel.'),
    maxConcurrency: z.number().int().positive().optional().describe('Max concurrent executions.'),
    comment: z.string().optional(),
  })
  .extend(ActionMetaSchema.shape);

const ReflectNodeSchema = z.object({
  kind: z.literal('reflect').describe('Write a reasoning note to scratch. No side effects.'),
  content: z.string().describe('The note to persist.'),
  scope: z.enum(['scratch', 'workflow', 'persistent']).optional().describe('Memory scope. Default: scratch.'),
  comment: z.string().optional(),
});

const FinalNodeSchema = z.object({
  kind: z.literal('final').describe('Terminal action. Ends the workflow and returns the result.'),
  result: JsonValueSchema.describe('The workflow result returned to the caller.'),
  comment: z.string().optional(),
});

export { PlanNodeSchema };

export const ActionPlanSchema = z
  .array(PlanNodeSchema)
  .min(1)
  .describe('Ordered list of plan nodes to execute. Use a single final node to end immediately.');

