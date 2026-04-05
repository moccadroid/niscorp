# The Rebuild: What We Know, What We Want, How We Get There

Everything in this archive is research. Proven concepts. Working prototypes. None of the code survives - but all of the knowledge does. This document is about taking that knowledge and building something open-source, cohesive, and production-grade from scratch.

---

## What We Proved

Let's be honest about what actually worked and what was friction.

### The things that are genuinely good ideas

**1. JSON all the way down is the right call.**
Layouts, actions, transforms, queries, behaviors - all JSON. This is the single most important architectural decision. It means every layer is AI-generatable, inspectable, cacheable, and composable. Keep this. Double down on it.

**2. The LLM-never-touches-SQL pattern is brilliant.**
LLM generates a constrained DSL. DSL compiles deterministically to parameterized SQL. The LLM can't produce injection attacks, can't write inefficient queries, can't bypass scope policies. Cache-by-shape means the LLM cost amortizes to zero for repeated patterns. This is a genuine innovation and should be a flagship open-source project.

**3. The JSON→JSON transformation engine has real standalone value.**
Pure functional, no code execution, compiles to IR for 2-5x speedup. It's useful far beyond this platform - anyone mapping API responses, ETL pipelines, webhook payloads. As a standalone open-source lib, this could get real adoption on its own.

**4. The shell/canvas/action architecture works.**
Server pushes UI commands over WebSocket. Client is a thin renderer. Actions have lifecycles. Canvases are stacks. This is the right model for agentic UX. The Cassandra demo proved it - 10 coordinated actions, real-time multi-shell orchestration, LLM-driven layout generation. It works.

**5. The agentic frame (manifold + behaviors + plan execution) is solid conceptually.**
Event bus, agent registry, tool registry, policy gates, observation logging, bounded plan execution. The concepts that evolved into Cortex are sound. The execution was messy because it was research - but the model is right.

**6. Universal LLM abstraction is table stakes.**
Fallbacks, structured output, streaming, retries. You need this. Everyone needs this. But it was never integrated into Neon, which was a mistake. This time it's foundational.

### The things that need rethinking

**1. Too many separate packages too early.**
Seven separate repos with separate builds, separate versioning, separate CI. For R&D this was fine. For a cohesive platform it's overhead. Some of these should be a monorepo. Some should stay standalone. We need to be deliberate.

**2. Vue → React is more than a framework swap.**
The original UI framework's architecture is deeply Vue-specific (VNodes, composables, directives, reactive refs). The React version needs to think in React idioms - hooks, RSC compatibility, suspense boundaries, concurrent rendering. The JSON→component rendering engine needs a fundamental redesign, not a port.

**3. The agentic frame was tangled with the demo app.**
Neon (the Nuxt app) mixed generic runtime infrastructure with Cassandra-specific swarm logic, hotel demo data, magic-link auth, and Socket.io wiring. The agentic frame needs to be extracted as a standalone, framework-agnostic runtime. No Nuxt. No Vue. No domain logic. Just the orchestration substrate.

**4. Eden and Rhea were pure research.**
Interesting concepts worth learning from, but not part of the next step. Eden's RAG approach and Rhea's DSL testing ideas may inform future work, but they don't carry forward as projects.

**5. No persistence story.**
Events, workflow state, agent memory - all in-memory. For production you need durable state. This wasn't addressed because it was research. Now it's critical.

---

## The New Architecture

Five packages, one monorepo, under `@niscorp`.

### Package Structure

```
@niscorp                   ← Monorepo
  ├── packages/
  │   ├── prism/           ← @niscorp/prism   — JSON transformation engine
  │   ├── signal/          ← @niscorp/signal   — Universal LLM abstraction
  │   ├── cortex/          ← @niscorp/cortex   — Agentic orchestration runtime
  │   ├── vex/             ← @niscorp/vex    — Declarative query synthesis
  │   └── nova/            ← @niscorp/nova   — React UI framework + shell system
  └── apps/
      ├── playground/      ← Proof-of-concept: everything working together
      └── docs/            ← Documentation site
```

### Why this structure

**Monorepo with independently publishable packages.** Each package has its own `package.json`, its own tests, its own build. But they share tooling, CI, and can reference each other during development without version gymnastics. Turborepo or Nx for orchestration.

**Each package is useful alone.** Someone who just wants JSON transformation gets `@niscorp/prism`. Someone who just wants LLM abstraction gets `@niscorp/signal`. Someone who wants the full agentic UI platform uses them together. This is how you get open-source adoption - the pieces are valuable independently.

**The playground app is the proof.** It demonstrates everything working together - like what Neon was, but clean. Not a package, just a demo.

### What goes where

| Concern | Package | Standalone value | Key decision |
|---------|---------|-----------------|--------------|
| JSON→JSON transformation | `@niscorp/prism` | High - useful for any API mapping, ETL, webhooks | Keep almost as-is. Already well-designed. |
| LLM provider abstraction | `@niscorp/signal` | High - everyone needs this | Rewritten. Middleware, streaming. |
| Intent→SQL synthesis | `@niscorp/vex` | High - the concept is novel | Rewritten. Database-agnostic. Prism as dep. |
| Agent orchestration | `@niscorp/cortex` | Medium-high - needs Signal | Agentic frame extracted. No framework deps. |
| Declarative UI + shells | `@niscorp/nova` | Medium - needs React ecosystem | Full React rewrite. JSON→JSX engine. |

---

## Package-by-Package Design

### `@niscorp/prism` - JSON Transformation Engine

**What changes from the original:** Almost nothing architecturally. The original transformation engine is the most mature and cleanest design in the archive. The changes are:

- Drop Zod v3 compatibility layer (just support Zod 4+)
- Add a few missing operations that came up during Query integration (string interpolation, date arithmetic)
- Improve error messages with source location tracking
- Add a "playground" mode that shows step-by-step evaluation for debugging
- Consider WASM compilation path for extreme performance cases

**Open-source positioning:** "Like jq, but for JavaScript. Pure JSON transformation DSL with compilation, caching, and zero code execution risk."

### `@niscorp/signal` - Universal LLM Abstraction

**What's new:**

- Cleaner provider interface (the current one is a bit muddled between OpenRouter-specific and generic)
- First-class structured output with Zod schema → JSON Schema conversion built in
- Streaming that composes well (not just AsyncIterable but also ReadableStream for web compatibility)
- **Middleware pattern** for observability, caching, rate limiting, cost tracking. Instead of baking these in, make them composable.
- Tool calling that handles the full loop (call → result → continue) not just single-shot
- **Model catalog** with capability metadata (supports tools? supports vision? context window size?) for intelligent routing
- Provider-specific optimizations as plugins, not built-in (Groq batching, Cerebras speed, etc.)

**Open-source positioning:** "One interface for every LLM. Fallbacks, structured output, streaming, middleware. 2KB core, everything else is plugins."

### `@niscorp/vex` - Declarative Query Synthesis

**What's new:**

- **Database-agnostic core.** The DSL and the agent loop shouldn't assume PostgreSQL. The compilation step should be pluggable (Postgres adapter, MySQL adapter, SQLite adapter, maybe even API adapter for REST backends).
- **Focus on SQL synthesis.** Make the query synthesis approach the best it can be. RAG concepts from earlier research may inform future work, but don't belong here.
- **Better introspection model.** Instead of one-shot schema discovery at startup, support incremental introspection with schema change detection. Emit events when schema changes so caches can be invalidated.
- **First-class embedding support** but as a pluggable concern, not hardcoded to OpenAI.
- **Scope policies should be more expressive.** The current model (field-equals-value) covers 80% of cases. Add row-level security expressions, column-level access control, and computed scopes.
- **Prism integration should be tighter.** Currently the mapping agent generates Prism IR in a separate step. Consider making the transformation layer a built-in part of the query pipeline, not an optional add-on.

**Open-source positioning:** "Ask for data in English. Get it in any shape. Works with any database."

### `@niscorp/cortex` - Agentic Orchestration

The biggest redesign. The concepts are right but the implementation was research-grade.

- **Framework-agnostic.** No Nuxt, no Vue, no HTTP framework deps. Pure TypeScript. Runs in Node, Deno, Bun, Cloudflare Workers, or the browser.
- **Clean manifold.** Registry (agents, tools, behaviors) + Bus (pub/sub) + Ledger (cost tracking) + Store (durable state). That's it. No event store replay yet - add it later when the model is proven.
- **Agent as a function.** `agent.execute(input, context) → output | ActionPlan`. No hidden state. No singletons. Agents are stateless functions that take input and return structured output. State lives in the manifold store, scoped by workflow ID.
- **Plan execution is the runtime's job, not the agent's.** Agent produces a plan. Runtime executes it. Clear separation. The tick model (bounded depth, bounded iterations) stays.
- **Behaviors are the autonomous layer.** Event-driven rules that trigger agent execution. This is how long-running workflows work - a behavior listens for events, decides what agent to invoke, handles the result.
- **Tool interface aligned with MCP.** The tool protocol should be compatible with Model Context Protocol so you can mount MCP servers as tool providers. This gets you instant access to every MCP-compatible tool ecosystem.
- **Persistence interface, not implementation.** Define `StateStore`, `EventLog`, `ConversationStore` as interfaces. Ship an in-memory implementation and a PostgreSQL implementation. Let users bring their own.
- **Observation/telemetry as OpenTelemetry spans.** Don't invent a custom observability format. Use OTEL. Every agent execution is a span. Every tool call is a child span. This integrates with existing monitoring infrastructure for free.

**Open-source positioning:** "Agentic runtime for TypeScript. Agents, tools, behaviors, plans. Framework-agnostic, observable, composable."

### `@niscorp/nova` - React UI Framework + Shell System

Everything changes because React. But the *concepts* stay the same.

**The three systems translate to React:**

1. **UI Primitives** → React components with Tailwind. Drop the "neon glow" theming as default (make it optional/pluggable). Ship clean, unstyled primitives that work with any design system. Think Radix UI but for agent-driven interfaces.

2. **Layout Engine** → JSON→JSX renderer. This is the interesting one.
   - Layout nodes become React elements via `React.createElement`
   - Path bindings (`$.field`) resolve against a context provider
   - Template bindings use string interpolation
   - Conditional/loop nodes map naturally to React patterns
   - **Component registry becomes a React context** - components are registered, layouts reference them by string name, the renderer resolves them
   - **RSC compatibility.** Layout rendering should work in React Server Components for initial paint, then hydrate for interactivity. This is a major advantage over the Vue version.
   - Consider **React Compiler** compatibility from day one

3. **Action/Shell System** → This is mostly state management + lifecycle, which is framework-agnostic.
   - Shell state machine can be a vanilla TypeScript class
   - React integration via hooks: `useShell()`, `useCanvas()`, `useAction()`, `useActionData()`
   - Canvas rendering via context providers
   - Action lifecycle maps to React effects
   - **Skills (state operations) should use Immer** or similar for immutable updates instead of custom set/toggle/increment logic. Or even just plain reducers.

**Event system redesign:**
- The Vue version used a custom event bus. In React, use the platform: DOM events bubble naturally, custom events propagate, and the shell can intercept at the boundary.
- For cross-action communication, keep the message bus but make it a simple pub/sub that works outside React too (so the server runtime can participate).

**Server-authoritative protocol stays the same.** `UICommandBatch` / `ClientEventEnvelope` - this is framework-agnostic by design. The React client just needs to apply command batches to shell state and emit events back.

**Open-source positioning:** "Declarative UI framework for AI agents. JSON layouts, shell orchestration, server-authoritative UX. Built on React."

---

## What Merges, What Splits

| Original | New Home | Reasoning |
|----------|----------|-----------|
| *neon-ui* layout engine | `@niscorp/nova` | Core of the React rewrite |
| *neon-ui* action/shell system | `@niscorp/nova` + `@niscorp/cortex` | Shell state machine is runtime-level; React bindings are UI-level |
| *neon-ui* component primitives | `@niscorp/nova` | Redesigned for React + headless patterns |
| *project-iris* | `@niscorp/prism` | Rewritten from scratch. Same architecture. |
| *rnd.dqs* | `@niscorp/vex` | Rewritten. Database-agnostic. |
| *rnd.proteus* | `@niscorp/signal` | Rewritten. Middleware pattern. |
| *Neon* agentic frame | `@niscorp/cortex` | Extracted, cleaned, framework-agnostic |
| *rnd.project-adam* | absorbed into Cortex | Archive only. |
| *project-eden* | archived | Pure research. |
| *project-rhea* | archived | Pure research. |
| *Neon* app | `apps/playground` | Demo becomes playground app. |

---

## What's Actually New (things the R&D didn't cover)

### 1. React Server Components integration
None of the original work touched RSC. `@niscorp/nova` should support:
- Server-side layout rendering for initial paint (fast first frame)
- Hydration for interactivity
- Streaming server components for progressive loading
- This gives the platform a performance story that the Vue version never had

### 2. Edge runtime compatibility
The original Neon was Node-only (PostgreSQL driver, Socket.io, Nuxt SSR). The new architecture should support:
- `@niscorp/prism`, `@niscorp/signal`, `@niscorp/cortex` running on Cloudflare Workers, Vercel Edge, Deno Deploy
- Only `@niscorp/vex` (with SQL) requires Node/long-lived processes
- This opens up edge-first deployment patterns

### 3. Multi-modal agent support
The original only handled text. `@niscorp/cortex` should support:
- Vision (agents that can see screenshots, images, documents)
- Audio (agents that can process voice input)
- These are increasingly standard in LLM APIs and the abstraction layer should handle them

### 4. Developer experience tooling
- **CLI** for scaffolding, running the playground, generating schemas
- **VS Code extension** for layout/action JSON editing with IntelliSense
- **DevTools** browser extension showing shell state, action lifecycle, agent activity
- **Storybook-like** component explorer for the UI primitives

### 5. Plugin architecture
The original had adapters for the component registry and for query synthesis. The new version should have a first-class plugin system:
- Custom component libraries register as UI plugins
- Database adapters register as Vex plugins
- LLM providers register as Signal plugins
- Tool providers register as Cortex plugins
- Everything is the same pattern: `register(name, implementation)`

### 6. Collaboration/multiplayer
The wire protocol supports it but was never built:
- Multiple users observing/controlling the same shell
- Operator takes over from agent mid-conversation
- Shared workspace with live cursors/selections
- This is the natural extension of server-authoritative UX

---

## Build Order

What to build first matters. Here's the dependency chain and suggested order:

### Phase 1: Foundations (parallel)
These have no dependencies on each other. Build simultaneously.

1. **`@niscorp/prism`** - Nearly done already. Minimal changes. Ship fast, get adoption.
2. **`@niscorp/signal`** - Clean API, middleware, streaming. Foundation for everything else.
3. **`@niscorp/cortex` core** - Manifold, agent interface, plan execution, tool protocol. No persistence yet. In-memory only.

### Phase 2: Data + UI (parallel, depends on Phase 1)
4. **`@niscorp/vex`** - Depends on Prism and Signal. SQL synthesis first.
5. **`@niscorp/nova` core** - React layout engine + component registry. No shell system yet. Just JSON→React rendering with bindings.

### Phase 3: Integration
6. **`@niscorp/nova` shell system** - Depends on Cortex for state machine concepts. Action lifecycle, canvas stacks, wire protocol.
7. **`apps/playground`** - Proof-of-concept tying it all together.

### Phase 4: Polish
8. **`apps/docs`** - Documentation site
9. **DevTools, CLI, VS Code extension**

---

## Open Source Strategy

### What makes this competitive

The AI tooling space is crowded. What makes this worth open-sourcing:

1. **Prism** has no real competitor. `jq` is CLI-only. JavaScript transformation libraries are either string-template-based (security risk) or imperative (can't serialize). Prism is pure JSON, compilable, and AI-generatable.

2. **The query synthesis pattern** (LLM → constrained DSL → deterministic SQL) is novel. Everyone else does text-to-SQL. This is fundamentally safer and cacheable.

3. **Server-authoritative agentic UX** is the right model that nobody has built well yet. Vercel's AI SDK does streaming text. This does streaming *applications*.

4. **The full stack works together** but each piece is useful alone. This is how you get adoption - people come for Prism, discover Query, realize Cortex ties it together, and end up using the full platform.

### Licensing
MIT for everything. No dual licensing games. No enterprise features behind a paywall. Build trust through openness.

### Community
- Each package gets its own README, examples, and getting-started guide
- A main docs site shows the full platform story
- Playground app is the "try it now" experience
- Ship early, iterate in public

---

## What We're Still Missing (honest gaps)

1. **Authorization model.** Vex has scope policies. Cortex has policy gates. But there's no unified auth/authz story. Who is the user? What can they access? How do scopes flow from auth to Vex to Nova? This needs design before building.

2. **Offline / degraded mode.** Server-authoritative means server must be reachable. What happens when it's not? Queued events? Cached layouts? Optimistic updates? This is hard and important for mobile.

3. **Migration story.** When Prism configs change, when database schemas change, when action definitions change - how do you migrate? Versioning strategy needed.

4. **Cost management.** LLM calls cost money. The ledger concept exists but there's no user-facing budget controls, no alerting, no per-tenant metering. For a platform that's used by others, this is mandatory.

5. **Testing the agents themselves.** How do you test that an agent produces good plans? That a swarm coordinates correctly? That the layout agent generates usable UIs? Need an agent testing framework, probably LLM-evaluated.

6. **Internationalization.** None of the original work considered i18n. Layouts need to support translations. Agent prompts need locale awareness. Query results need localized formatting.

---

## TL;DR

We proved the concept works. Now we rebuild it right:

- **Monorepo** with independently publishable packages under `@niscorp`
- **React** instead of Vue, with RSC support from day one
- **Framework-agnostic Cortex** extracted from the Nuxt coupling
- **Prism stays almost unchanged** architecturally - it's the most mature piece
- **Query gets database-agnostic** with pluggable adapters
- **Signal gets a middleware architecture** and becomes foundational
- **Cortex gets extracted and cleaned** - no demo logic, no framework deps
- **Everything is MIT, open source, designed for adoption**
- **Build Prism and Signal first** - they're independently valuable and foundation for everything else

The platform's unique value: **an AI agent can query data, transform it, generate interactive UI, and present it to a user - all through type-safe JSON definitions, all observable, all cacheable.** Nobody else has this stack. Let's ship it.
