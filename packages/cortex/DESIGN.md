# Design Document: `@niscorp/cortex` — Agentic Orchestration Runtime

## Purpose

A framework-agnostic runtime for building multi-agent systems. Agents produce structured plans. The runtime executes them. Behaviors react to events. The manifold coordinates everything.

**One sentence:** Agents, tools, plans, behaviors, and policies - composable building blocks for agentic applications, with no framework dependencies.

---

## What We Learned

The original agentic frame (evolved from *rnd.project-adam* into *Neon*) proved the concepts work. The Cassandra demo ran 10 coordinated actions with real-time multi-shell orchestration. The research analyst swarm ran parallel specialist agents producing synthesized reports. The problems were implementation, not design:

### What worked
- **Manifold** as central coordinator (bus, registry, ledger, state store)
- **ActionPlan** as structured agent output (ask_agent, use_tool, tell_topic, wait, parallel, reflect, final)
- **Behavior layer** for event-driven autonomous workflows (pattern matching on topics, guard expressions, effects)
- **Policy gates** enforcing tool access and budget constraints
- **Observations** from every execution step (duration, result, errors)
- **Tick model** with bounded depth (not unbounded recursion)
- **Memory system** scoped per agent/workflow

### What was wrong
- **Tangled with Nuxt/Vue.** The runtime imported framework-specific code. Must be pure TypeScript.
- **Tangled with demo code.** Cassandra swarm logic leaked into generic runtime. Swarm-specific validation was in the executor.
- **`createAgent()` was a god function.** Prompt building, tool loop, output parsing, retry logic - all in one factory.
- **Two executor paths existed.** `executor.ts` and `planExecutor.ts` did similar things. Consolidate.
- **Persistence was in-memory only.** No durable state, no event replay, no workflow resumption.
- **No clear lifecycle for the manifold.** Start, stop, drain - these matter for production.

### What this package is NOT
- Not a web framework. No HTTP, no WebSocket, no routing.
- Not a UI library. No React, no Vue, no DOM.
- Not a database client. No SQL, no ORM.
- Not an LLM client. Uses the Signal package (`@niscorp/signal`) as a peer dependency.

It is ONLY the orchestration substrate. Everything else plugs in.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Manifold                          │
│                                                     │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │  Registry   │  │    Bus     │  │   Ledger     │  │
│  │ agents      │  │  pub/sub   │  │  cost/tokens │  │
│  │ tools       │  │  wildcard  │  │  budgets     │  │
│  │ behaviors   │  │  topics    │  │  per-workflow │  │
│  └────────────┘  └────────────┘  └──────────────┘  │
│                                                     │
│  ┌────────────┐  ┌────────────┐                    │
│  │ State Store│  │ Event Log  │                    │
│  │ per-workflow│  │ append-only│                    │
│  │ pluggable  │  │ pluggable  │                    │
│  └────────────┘  └────────────┘                    │
└─────────────────────────────────────────────────────┘
        ↑                    ↑
        │                    │
┌───────┴───────┐   ┌───────┴──────────────┐
│    Agents     │   │     Behaviors        │
│ stateless fns │   │ event → effect rules │
│ input → plan  │   │ pattern matching     │
│ or output     │   │ state management     │
└───────┬───────┘   └──────────────────────┘
        │
        ↓
┌─────────────────────────────────────────┐
│            Runtime Executor             │
│  Executes ActionPlans depth-first       │
│  Policy gate on every step              │
│  Bounded depth + bounded ticks          │
│  Produces observations                  │
└─────────────────────────────────────────┘
```

---

## Public API

```typescript
// ═══════════════════════════════════════════════════════════
// Manifold (Central Coordinator)
// ═══════════════════════════════════════════════════════════

export const createManifold: (config?: ManifoldConfig) => Manifold;

type Manifold = {
  // Registry
  registerAgent: (agent: AgentDefinition) => void;
  registerTool: (tool: ToolDefinition) => void;
  registerBehavior: (behavior: BehaviorDefinition) => void;

  // Bus
  emit: (topic: string, payload?: unknown, meta?: EventMeta) => void;
  on: (pattern: string, handler: EventHandler) => Unsubscribe;

  // State
  getState: (workflowId: string, key: string) => Promise<unknown>;
  setState: (workflowId: string, key: string, value: unknown) => Promise<void>;

  // Execution
  execute: (agentId: string, input: unknown, options?: ExecuteOptions) => Promise<ExecuteResult>;

  // Lifecycle
  start: () => Promise<void>;
  stop: () => Promise<void>;
  drain: () => Promise<void>;         // Wait for in-flight work to complete, then stop
};

// ═══════════════════════════════════════════════════════════
// Agent Definition
// ═══════════════════════════════════════════════════════════

export const defineAgent: (config: AgentConfig) => AgentDefinition;

// ═══════════════════════════════════════════════════════════
// Tool Definition
// ═══════════════════════════════════════════════════════════

export const defineTool: (config: ToolConfig) => ToolDefinition;

// ═══════════════════════════════════════════════════════════
// Behavior Definition
// ═══════════════════════════════════════════════════════════

export const defineBehavior: (config: BehaviorConfig) => BehaviorDefinition;

// ═══════════════════════════════════════════════════════════
// Schemas & Types
// ═══════════════════════════════════════════════════════════

export { ActionPlanSchema, AgentConfigSchema, ToolConfigSchema, BehaviorConfigSchema };
export type { Manifold, AgentDefinition, ToolDefinition, BehaviorDefinition, ActionPlan, Observation };
```

---

## Agents

### Agent Definition

```typescript
type AgentConfig = {
  id: string;
  name: string;
  description: string;

  // What the agent does
  instructions: string;                // System prompt content

  // What the agent can use
  tools?: string[];                    // Tool IDs from registry (or '*' for all)

  // How the agent outputs
  outputMode: 'plan' | 'structured' | 'text';

  // For structured mode: output schema
  outputSchema?: z.ZodType;

  // LLM configuration
  model?: string;                      // Model identifier (e.g., 'gpt-4o')

  // Constraints
  policy?: PolicyConfig;
};
```

### Agent Execution Modes

| Mode | Agent Returns | Use Case |
|------|--------------|----------|
| `plan` | `ActionPlan` | Agent delegates work to tools and other agents |
| `structured` | Typed JSON (validated by outputSchema) | Agent produces data (analysis, classification, extraction) |
| `text` | String | Agent produces free-form text (summaries, responses) |

### Agent as a Pure Function

Agents are stateless. They receive input and context, produce output. No hidden state, no singletons.

```typescript
// Conceptually:
agent.execute(input, context) → Promise<ActionPlan | StructuredOutput | string>
```

The internal implementation:
1. Build context pack (input + observations from previous steps + memory reads)
2. Build messages (system prompt with instructions + context)
3. Call LLM (via Signal package (`@niscorp/signal`))
4. If tool calls in response → execute tools internally, append results, re-call LLM
5. Parse output according to outputMode
6. Validate (ActionPlanSchema for plan, outputSchema for structured)
7. Return

**Tool calls during agent execution are INTERNAL.** They are part of the agent's thinking process. They do NOT appear in the ActionPlan. The plan only contains the agent's final decision about what should happen next.

---

## Action Plans

The structured output of agents in `plan` mode. A tree of operations to execute.

### Plan Node Types

```typescript
type ActionPlan = PlanNode[];

type PlanNode =
  | AskAgentNode
  | UseToolNode
  | TellTopicNode
  | WaitNode
  | ParallelNode
  | ReflectNode
  | FinalNode;
```

#### `ask_agent` - Delegate to another agent

```typescript
type AskAgentNode = {
  kind: 'ask_agent';
  agentId: string;
  input: unknown;
  as?: string;                         // Store result under this name in observations
};
```

#### `use_tool` - Invoke a registered tool

```typescript
type UseToolNode = {
  kind: 'use_tool';
  toolId: string;
  input: unknown;
  as?: string;
};
```

#### `tell_topic` - Publish an event (fire and forget)

```typescript
type TellTopicNode = {
  kind: 'tell_topic';
  topic: string;
  payload?: unknown;
};
```

#### `wait` - Block until event or timeout

```typescript
type WaitNode = {
  kind: 'wait';
  topic: string;                       // Topic pattern to wait for
  timeoutMs?: number;
  as?: string;
};
```

#### `parallel` - Concurrent execution

```typescript
type ParallelNode = {
  kind: 'parallel';
  branches: PlanNode[];
  maxConcurrency?: number;             // Default: unbounded
};
```

#### `reflect` - Write to memory/scratch

```typescript
type ReflectNode = {
  kind: 'reflect';
  content: string;                     // What the agent wants to remember
  scope?: 'scratch' | 'workflow' | 'persistent';
};
```

#### `final` - Terminal result

```typescript
type FinalNode = {
  kind: 'final';
  result: unknown;
};
```

### Plan Execution

The runtime executor processes plans depth-first:

```
For each node in plan:
  1. Check policy gate (is this tool/agent allowed? budget remaining?)
  2. Execute node:
     - ask_agent: call manifold.execute(agentId, input)
     - use_tool: call tool.execute(input)
     - tell_topic: call manifold.emit(topic, payload)
     - wait: subscribe to topic, block until event or timeout
     - parallel: execute branches concurrently (up to maxConcurrency)
     - reflect: write to memory store
     - final: return result
  3. Record observation (duration, result, error)
  4. If result stored as `as` name, add to observation context
```

### Bounded Execution

- **`maxPlanDepth: 2`** (default) - Plans can nest (ask_agent returns a plan), but only 2 levels deep. This prevents unbounded recursion.
- **`maxTicks: 20`** (default) - Total steps across all nested plans. Safety net.
- **`maxDurationMs: 60_000`** (default) - Total wall-clock time for the entire execution.

---

## Tools

### Tool Definition

```typescript
type ToolConfig = {
  id: string;
  name: string;
  description: string;
  category?: string;                   // For policy filtering (e.g., 'web', 'database', 'file')
  riskLevel?: 'low' | 'medium' | 'high';

  input: z.ZodType;                    // Input schema (Zod)
  output?: z.ZodType;                  // Output schema (optional, for documentation)

  execute: (input: unknown, context: ToolContext) => Promise<unknown>;
};

type ToolContext = {
  workflowId: string;
  agentId: string;
  signal: AbortSignal;
};
```

### MCP Compatibility

Tools should be compatible with the Model Context Protocol. The `defineTool` function generates MCP-compatible metadata:

```typescript
const tool = defineTool({
  id: 'web.search',
  name: 'Web Search',
  description: 'Search the web for information',
  category: 'web',
  riskLevel: 'low',
  input: z.object({ query: z.string(), maxResults: z.number().optional() }),
  execute: async (input) => { ... },
});

// tool.toMcpTool() → MCP-compatible tool definition
```

Future: mount MCP servers as tool providers, auto-registering their tools.

---

## Behaviors

Event-driven rules for autonomous workflows. Behaviors listen for events and trigger effects.

### Behavior Definition

```typescript
type BehaviorConfig = {
  id: string;
  name: string;
  description: string;

  // What events trigger this behavior
  triggers: BehaviorTrigger[];

  // Initial state
  initialState?: Record<string, unknown>;
};

type BehaviorTrigger = {
  on: string;                          // Topic pattern (supports wildcards: "order.*", "user.#")
  guard?: (event: BusEvent, state: Record<string, unknown>) => boolean;
  effect: BehaviorEffect;
};
```

### Effects

```typescript
type BehaviorEffect =
  | { ask: { agentId: string; input: unknown | ((event: BusEvent, state: Record<string, unknown>) => unknown) } }
  | { emit: { topic: string; payload?: unknown } }
  | { setState: Record<string, unknown> | ((state: Record<string, unknown>, event: BusEvent) => Record<string, unknown>) }
  | { sequence: BehaviorEffect[] }
  | { conditional: { if: (event: BusEvent, state: Record<string, unknown>) => boolean; then: BehaviorEffect; else?: BehaviorEffect } };
```

### Example Behavior

```typescript
const escalationBehavior = defineBehavior({
  id: 'auto-escalate',
  name: 'Automatic Escalation',
  description: 'Escalate to human when sentiment is negative',
  initialState: { escalated: false },
  triggers: [
    {
      on: 'analysis.sentiment',
      guard: (event, state) => event.payload.score < 0.3 && !state.escalated,
      effect: {
        sequence: [
          { setState: { escalated: true } },
          { ask: { agentId: 'handoff-agent', input: (event) => ({ conversationId: event.payload.conversationId }) } },
          { emit: { topic: 'notification.operator', payload: { reason: 'negative sentiment' } } },
        ],
      },
    },
  ],
});
```

---

## Policy System

Policies constrain what agents and tools can do.

### Policy Config

```typescript
type PolicyConfig = {
  // Budget constraints
  budget?: {
    maxTokensPerRun?: number;
    maxCostPerRun?: number;            // USD
    maxTicksPerRun?: number;           // Default: 20
    maxPlanDepth?: number;             // Default: 2
    maxDurationMs?: number;            // Default: 60000
    maxParallelBranches?: number;      // Default: 5
  };

  // Tool access
  tools?: {
    allow?: string[];                  // Tool IDs or patterns ('web.*')
    deny?: string[];                   // Overrides allow
    requireConfirmation?: string[];    // Pause and emit event before executing
    maxRiskLevel?: 'low' | 'medium' | 'high';
  };

  // Agent access
  agents?: {
    allow?: string[];                  // Which agents can be delegated to
    deny?: string[];
  };
};
```

### Policy Gate

Before every plan node execution, the policy gate checks:

1. Is this tool/agent allowed by the policy?
2. Is the budget exceeded (tokens, cost, ticks)?
3. Does this tool require confirmation?
4. Is the risk level acceptable?

If denied, the gate returns a denial reason:

```typescript
type GateResult =
  | { allowed: true }
  | { allowed: false; reason: DenialReason };

type DenialReason =
  | 'tool_not_registered'
  | 'tool_denied_by_policy'
  | 'agent_denied_by_policy'
  | 'budget_exceeded'
  | 'depth_exceeded'
  | 'ticks_exceeded'
  | 'timeout_exceeded'
  | 'confirmation_required'
  | 'risk_level_exceeded';
```

### Policy Presets

```typescript
export const policyPresets = {
  readonly: {
    tools: { maxRiskLevel: 'low' },
    budget: { maxTokensPerRun: 10_000, maxTicksPerRun: 5 },
  },
  standard: {
    budget: { maxTokensPerRun: 50_000, maxTicksPerRun: 20 },
    tools: { maxRiskLevel: 'medium' },
  },
  autonomous: {
    budget: { maxTokensPerRun: 200_000, maxTicksPerRun: 50 },
    tools: { maxRiskLevel: 'high' },
  },
} as const;
```

---

## Observations

Every execution step produces an observation. This is the primary debugging and monitoring primitive.

```typescript
type Observation = {
  stepKind: PlanNode['kind'];
  agentId?: string;
  toolId?: string;
  durationMs: number;
  result?: unknown;
  error?: string;
  timestamp: number;
  workflowId: string;
  depth: number;
  tick: number;
};
```

Observations are:
- Passed to agents as context (so they know what happened before)
- Emitted on the bus (so behaviors can react)
- Logged to the event log (so workflows can be replayed/debugged)

---

## Event Bus

In-process pub/sub with wildcard topic matching.

### Topics

Topics are dot-separated strings: `workflow.started`, `agent.completed`, `tool.error`.

### Wildcards

- `*` matches one segment: `agent.*` matches `agent.completed`, `agent.error`
- `#` matches zero or more segments: `workflow.#` matches `workflow.started`, `workflow.step.completed`

### Event Shape

```typescript
type BusEvent = {
  topic: string;
  payload?: unknown;
  meta: {
    timestamp: number;
    workflowId?: string;
    correlationId?: string;            // Links related events
    causationId?: string;              // What caused this event
  };
};
```

---

## State & Persistence

### Interfaces

```typescript
type StateStore = {
  get: (workflowId: string, key: string) => Promise<unknown>;
  set: (workflowId: string, key: string, value: unknown) => Promise<void>;
  delete: (workflowId: string, key: string) => Promise<void>;
  clear: (workflowId: string) => Promise<void>;
};

type EventLog = {
  append: (event: BusEvent) => Promise<void>;
  read: (workflowId: string, options?: { since?: number; limit?: number }) => Promise<BusEvent[]>;
};
```

### Built-in Implementations

- **`memoryStateStore()`** - In-memory Map. Good for development and short-lived workflows.
- **`memoryEventLog()`** - In-memory array. Good for development.

Users provide their own implementations for production (PostgreSQL, Redis, etc.).

---

## Manifold Configuration

```typescript
type ManifoldConfig = {
  // Persistence (default: in-memory)
  stateStore?: StateStore;
  eventLog?: EventLog;

  // LLM client (from Signal package (`@niscorp/signal`))
  llm: SignalClient;

  // Default policy for all agents
  defaultPolicy?: PolicyConfig;

  // Lifecycle hooks
  onWorkflowStart?: (workflowId: string) => void;
  onWorkflowEnd?: (workflowId: string, result: unknown) => void;
  onObservation?: (observation: Observation) => void;
  onError?: (error: Error, context: { workflowId?: string; agentId?: string }) => void;
};
```

---

## Memory System

Agents can read/write memory during their tool-use phase (not via ActionPlans).

### Memory Scopes

| Scope | Lifetime | Visibility |
|-------|----------|-----------|
| `scratch` | Current agent execution only | This agent, this run |
| `workflow` | Current workflow | All agents in this workflow |
| `persistent` | Until explicitly deleted | Configurable (per-agent, per-user, global) |

### Memory as Internal Tools

Memory is implemented as two built-in tools that agents can use during their thinking:

```typescript
// Built-in, always available to agents
{
  id: 'memory.read',
  input: z.object({ scope: z.enum(['scratch', 'workflow', 'persistent']), key: z.string() }),
  execute: async ({ scope, key }, ctx) => stateStore.get(scopeKey(scope, ctx.workflowId, key)),
}

{
  id: 'memory.write',
  input: z.object({ scope: z.enum(['scratch', 'workflow', 'persistent']), key: z.string(), value: z.unknown() }),
  execute: async ({ scope, key, value }, ctx) => stateStore.set(scopeKey(scope, ctx.workflowId, key), value),
}
```

---

## File Structure

```
src/
├── index.ts                          # Public API
├── types.ts                          # Core types
├── schemas/
│   ├── index.ts                      # Barrel
│   ├── action-plan.ts                # ActionPlan, PlanNode schemas
│   ├── agent.ts                      # AgentConfig schema
│   ├── tool.ts                       # ToolConfig schema
│   ├── behavior.ts                   # BehaviorConfig schema
│   ├── policy.ts                     # PolicyConfig schema
│   └── observation.ts                # Observation schema
├── manifold/
│   ├── manifold.ts                   # createManifold implementation
│   ├── registry.ts                   # Agent/tool/behavior registration
│   ├── bus.ts                        # Event bus with wildcard topics
│   ├── ledger.ts                     # Cost/token accounting
│   └── lifecycle.ts                  # Start/stop/drain
├── agent/
│   ├── agent.ts                      # defineAgent + execution logic
│   ├── context-pack.ts               # Build context for LLM call
│   ├── prompt-builder.ts             # System/user message construction
│   ├── output-parser.ts              # Parse LLM response by mode
│   └── tool-loop.ts                  # Internal tool-use iteration
├── runtime/
│   ├── executor.ts                   # ActionPlan execution (depth-first)
│   ├── gate.ts                       # Policy enforcement
│   └── ticker.ts                     # Tick counting + bounds checking
├── behavior/
│   ├── behavior.ts                   # defineBehavior + activation logic
│   ├── matcher.ts                    # Topic pattern matching
│   └── effects.ts                    # Effect execution
├── memory/
│   ├── tools.ts                      # memory.read, memory.write built-in tools
│   └── scoping.ts                    # Scope key computation
├── store/
│   ├── types.ts                      # StateStore, EventLog interfaces
│   ├── memory-state.ts               # In-memory state store
│   └── memory-events.ts              # In-memory event log
└── utils/
    ├── id.ts                         # Workflow/correlation ID generation
    └── wildcard.ts                   # Topic pattern matching
```

---

## Dependencies

- Signal package (`@niscorp/signal`) (peer) - Agent intelligence
- `zod` (peer, ^4.0.0) - Schema validation

That's it. Two peer dependencies. Zero runtime dependencies. Runs anywhere JavaScript runs.

---

## Key Design Decisions

1. **Why agents are stateless functions, not stateful objects?** Testability, predictability, scaling. An agent takes input, produces output. State lives in the manifold store, scoped by workflow. This means agents can be retried, parallelized, and unit-tested trivially.

2. **Why ActionPlans instead of letting agents call tools directly?** Observability and control. When the agent produces a plan, the runtime can inspect it before execution, enforce policies, log it, and even modify it. Direct tool calls are opaque.

3. **Why internal tool calls during agent execution are hidden from the plan?** Separation of thinking and doing. The agent's tool calls (getSchema, search, calculate) are its reasoning process. The plan is its decision. The consumer of the plan shouldn't care how the agent reached its conclusion.

4. **Why bounded depth (maxPlanDepth: 2) instead of unlimited nesting?** Safety. Unbounded nesting is unbounded cost. Two levels covers 99% of real use cases (agent delegates to specialist, specialist produces result). If you need deeper, increase the limit explicitly.

5. **Why behaviors instead of just event handlers?** State. Behaviors maintain state across events within a workflow. A plain event handler is stateless. Behaviors can track "has this been escalated?", "how many retries so far?", "what was the last sentiment score?" - and use that state in guard expressions and effects.

6. **Why wildcard topics instead of typed channels?** Flexibility. Agentic systems are dynamic - agents produce events that weren't anticipated at compile time. Wildcard matching (`workflow.*`, `agent.#`) lets behaviors react to patterns without knowing every possible topic in advance.

7. **Why interfaces for persistence instead of built-in implementations?** The runtime should not dictate your infrastructure. In-memory is fine for dev. PostgreSQL is fine for production. Redis is fine for high-throughput. DynamoDB is fine for serverless. The interface is simple enough that any backend works.
