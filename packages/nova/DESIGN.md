# `@niscorp/nova` — Declarative UI Framework

JSON layouts, action lifecycles, shell orchestration. Framework-agnostic core, React adapter. Designed for AI agents.

---

## Architecture

Three systems, one package. The core is pure TypeScript with zero framework dependencies. React (or any framework) plugs in as a thin rendering adapter.

```
┌─────────────────────────────────────────────────────────────┐
│                        Shell                                 │
│  Canvas stacks, message bus, inter-action routing            │
│  Pure TypeScript state machine                               │
├─────────────────────────────────────────────────────────────┤
│                       Actions                                │
│  Definitions, runtime, lifecycle, triggers, mutations         │
│  Pure TypeScript logic                                       │
├─────────────────────────────────────────────────────────────┤
│                       Layout                                 │
│  JSON → RenderNode tree, bindings, scope chain, store        │
│  Pure TypeScript core                                        │
├─────────────────────────────────────────────────────────────┤
│                    Component Registry                        │
│  String name → component + metadata                          │
│  Framework-agnostic metadata, framework-specific components  │
├─────────────────────────────────────────────────────────────┤
│                  Framework Adapter (React)                    │
│  RenderNode[] → React elements, hooks, providers             │
│  ~200 lines, the only React-dependent code                   │
└─────────────────────────────────────────────────────────────┘
```

---

## System 1: Layout

Converts JSON layout definitions into a framework-agnostic render tree.

### Layout Nodes

```typescript
type LayoutNode =
  | ComponentNode
  | ConditionalNode
  | LoopNode
  | LayoutRefNode
  | LayoutNode[]
  | LayoutPrimitive;       // string, number, boolean, null → text

type ComponentNode = {
  component: string;       // Registry name
  props?: Record<string, unknown>;
  children?: LayoutContent | LayoutContent[];
  ref?: string;            // Event targeting ID
  model?: string;          // Two-way binding path: '$.name'
  events?: Record<string, EventConfig>;
};

type ConditionalNode = { if: Binding; then: LayoutNode; else?: LayoutNode };
type LoopNode = { for: Binding; as: string; key?: string; do: LayoutNode };
type LayoutRefNode = { ref: string };   // Layout ID or data path
```

### Bindings

```typescript
type Binding = string | TemplateBinding | ConditionalBinding;

// Path: "$.user.name" (data), "$item.price" (loop variable)
// Template: { template: "Hello {{$.name}}" }
// Conditional: { if: "$.active", then: "Yes", else: "No" }
```

### Scope Chain

Bindings resolve against a scope chain (array of scopes, innermost first):

```typescript
type ScopeChain = Record<string, unknown>[];

createScopeChain(data)       → [data]
pushScope(chain, { item })   → [{ item }, data]
```

- `$.user.name` → dot after `$`, resolves against data scopes
- `$item.name` → no dot, resolves as variable name

### Render Node (Framework-Agnostic Output)

The core renderer produces `RenderNode[]`, not framework-specific elements:

```typescript
type RenderNode =
  | { type: 'component'; name: string; props: Record<string, unknown>; children: RenderNode[]; ref?: string }
  | { type: 'text'; value: string }
  | { type: 'fragment'; children: RenderNode[] };
```

The framework adapter turns this into actual elements:

```typescript
// React adapter (~30 lines)
const toReact = (node: RenderNode, registry: ReactRegistry): React.ReactNode => {
  if (node.type === 'text') return node.value;
  if (node.type === 'fragment') return node.children.map(n => toReact(n, registry));
  const Component = registry.get(node.name);
  return React.createElement(Component, node.props, ...node.children.map(n => toReact(n, registry)));
};
```

### Layout Store

In-memory storage with versioning and reference resolution:

```typescript
type LayoutStore = {
  get: (id: string) => LayoutNode | undefined;
  set: (id: string, layout: LayoutNode) => void;
  delete: (id: string) => void;
  list: () => string[];
  resolveReferences: (layout: LayoutNode) => LayoutNode;
};
```

### Component Registry

Maps string names to components with LLM-consumable metadata:

```typescript
type ComponentRegistry = {
  register: (name: string, entry: ComponentEntry) => void;
  get: (name: string) => ComponentEntry | undefined;
  list: () => string[];
  has: (name: string) => boolean;
  getCatalog: () => ComponentCatalog;
  getJsonSchema: () => object;
};

type ComponentEntry = {
  component: unknown;      // Framework-specific (React.ComponentType, Vue component, etc.)
  meta: ComponentMeta;     // Framework-agnostic metadata
};

type ComponentMeta = {
  name: string;
  description: string;
  category: string;
  props: Record<string, PropMeta>;
  events?: Record<string, EventMeta>;
};
```

### Event Bus

UI events flow through a typed pub/sub:

```typescript
type EventBus = {
  emit: (type: string, payload?: unknown) => void;
  on: (type: string | RegExp, handler: EventHandler) => Unsubscribe;
  once: (type: string, handler: EventHandler) => Unsubscribe;
  scoped: (source: string) => EventBus;
};
```

Event types: `ui:click`, `ui:input`, `ui:submit`, `ui:focus`, `ui:blur`, `ui:model`.

### Agent Integration

```typescript
// Generate LLM prompt with component catalog
generateLayoutPrompt(registry) → string

// Validate a layout generated by an LLM
validateLayout(layout) → ValidationResult

// JSON Schema for LLM consumption
registry.getJsonSchema() → object
```

---

## Schema-First Design

**Important:** All type definitions in this document describe shapes. In the implementation, every definition that crosses a boundary is a **Zod schema** with `.describe()` on every field. Types are inferred via `z.infer<typeof Schema>`. No hand-written types for anything that's validated, serialized, or consumed by LLMs.

---

## System 2: Actions

An action is a self-contained unit of work with layout, data, and behavior.

### Action Definition

```
ActionDefinition:
  id: string
  name?: string
  description?: string
  layout?: string | LayoutNode           — layout ID or inline
  data?: Record<string, unknown>         — static defaults, merged with input on mount
  triggers?: TriggerConfig[]             — event/message → do steps
  endpoints?: Record<string, Endpoint>   — named HTTP calls
  lifecycle?: LifecycleConfig            — mount/unmount/suspend/resume hooks
```

Clean compared to the original neon-ui: no `initialData` (3 variants), no `onComplete`/`onCancel`, no `skills`, no 11 trigger schemas.

### Data Model

Two sources merge on mount:

```
definition.data    +    input (from shell.push)    =    action.data
{ counter: 0 }          { userId: 'u1' }               { counter: 0, userId: 'u1' }
```

Input overrides defaults. The merged result is the action's mutable state. Triggers mutate it. Endpoints write to it. The renderer reads it.

### Steps: Mutations + Effects

All behavior in Nova is expressed as ordered sequences of **steps**. A step is either a **mutation** (data layer) or an **effect** (outside world).

**Mutations** — change the action's data:

```
Mutation:
  { set: path, value: unknown }         — set field to value
  { set: path, from: path }             — copy from another field
  { toggle: path }                      — flip boolean
  { increment: path, by?: number }      — +1 or +N
  { decrement: path, by?: number }      — -1 or -N
  { push: path, value?: unknown }       — append to array
  { pop: path }                         — remove last from array
  { removeAt: path, index: number }     — remove at index
  { clear: path }                       — clear array/object
  { reset: path }                       — reset to initial value
```

**Effects** — interact with the outside world:

```
Effect:
  { call: endpoint }                                            — call named endpoint
  { call: endpoint, onSuccess?: Step[], onError?: Step[] }     — with branching
  { emit: { channel, payload? } }                              — publish to message bus
  { push: { action, canvas?, input? } }                        — push action onto canvas
  { pop: true }                                                — pop current action
  { replace: { action, input? } }                              — replace current action
```

**Step** is the union of Mutation and Effect.

Steps execute in order. Mutations are synchronous. Effects may be async (`call`). The `call` effect supports branching — `onSuccess` and `onError` are nested step arrays for handling API responses.

### The `do` Field

Triggers and lifecycle hooks share the same execution model: an ordered array of steps in a `do` field.

```json
{
  "event": "ui:click",
  "ref": "add-to-cart-btn",
  "do": [
    { "set": "loading", "value": true },
    { 
      "call": "addToCart",
      "onSuccess": [
        { "set": "loading", "value": false },
        { "emit": { "channel": "cart-updated" } }
      ],
      "onError": [
        { "set": "loading", "value": false },
        { "set": "error", "from": "@error.message" }
      ]
    }
  ]
}
```

Read aloud: "On click of add-to-cart button, do: set loading true, call addToCart — on success set loading false and emit cart-updated, on error set loading false and set error from the error message."

### Triggers

A trigger binds an event source to steps:

```
TriggerConfig:
  event?: string           — UI event: 'ui:click', 'ui:submit', 'ui:input'
  message?: string         — message bus channel
  ref?: string             — component ref to match
  do: Step[]               — ordered steps to execute
```

A trigger must have a source (`event` or `message`) and at least one step in `do`.

Simple example — toggle a boolean on click:
```json
{ "event": "ui:click", "ref": "toggle-btn", "do": [{ "toggle": "isOpen" }] }
```

Navigation example — go to next screen on submit:
```json
{ "event": "ui:submit", "ref": "form", "do": [{ "call": "saveForm" }, { "push": { "action": "confirmation" } }] }
```

Message example — update data when another action emits:
```json
{ "message": "cart-updated", "do": [{ "call": "refreshCart" }] }
```

### Endpoints

Named HTTP calls with template URLs and response targeting:

```
EndpointConfig:
  url: string                            — template: '/api/users/{{$.userId}}'
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: string | Record<string, unknown>
  target?: string                        — store response at this data path
  errorTarget?: string                   — store error at this data path
  transform?: unknown                    — Prism config for response transformation
```

`target` is where the response goes in action data. `transform` uses the injected transform function (Prism) to reshape the response before storing.

### Lifecycle

Four lifecycle events, each with an optional `do` array:

```
LifecycleConfig:
  mount?: Step[]             — runs when action mounts (load data, initialize)
  unmount?: Step[]           — runs when action unmounts (cleanup, emit)
  suspend?: Step[]           — runs when action is suspended (going to background)
  resume?: Step[]            — runs when action resumes (refresh data)
```

Same `Step[]` as triggers. Navigation effects (push/pop/replace) work in lifecycle too — `unmount` with a `{ push: { action: 'next' } }` replaces the old `onComplete`.

Typical patterns:

```json
{
  "lifecycle": {
    "mount": [{ "call": "loadUserData" }],
    "resume": [{ "call": "refreshUserData" }]
  }
}
```

The old `onComplete` / `onCancel` distinction is gone. If an action needs different unmount behavior depending on why, the **trigger** that causes unmount carries the navigation:

- "Submit" button trigger: `{ "do": [{ "call": "save" }, { "push": { "action": "confirmation" } }] }`
- "Back" button trigger: `{ "do": [{ "pop": true }] }`
- "Cancel" button trigger: `{ "do": [{ "pop": true }] }`

The action doesn't need to know why it's unmounting. The trigger that caused it already specified the navigation.

### Action Instance

```
ActionInstance:
  id: string                 — unique instance ID
  definitionId: string
  canvasId: string
  status: ActionStatus       — 'initializing' | 'active' | 'suspended' | 'unmounted'
  data: Record<string, unknown>
```

Four statuses. No 'completing' — unmount is immediate.

### Action Runtime

Pure TypeScript state machine. Does NOT import any framework. Split across files:

```
runtime/
├── runtime.ts          — createActionRuntime factory, public interface
├── lifecycle.ts        — mount, unmount, suspend, resume
├── data.ts             — data management, mutation execution
├── triggers.ts         — trigger matching + step execution
└── endpoints.ts        — HTTP calls with template resolution
```

```
ActionRuntime:
  instance: ActionInstance (readonly)
  definition: ActionDefinition (readonly)

  getData() → Record<string, unknown>
  updateData(updates) → void
  applyMutations(mutations: Mutation[]) → void
  executeSteps(steps: Step[]) → Promise<void>

  mount(input?) → Promise<void>
  unmount() → void
  suspend() → void
  resume() → void

  render() → RenderNode[]

  onDataChange(handler) → Unsubscribe
  onStatusChange(handler) → Unsubscribe

  dispose() → void
```

The framework adapter (React hooks) observes `onDataChange` and `onStatusChange` to trigger re-renders. The runtime itself has no rendering opinion.

---

## System 3: Shell

Orchestrates multiple actions across canvas stacks.

### Shell

```typescript
type Shell = {
  readonly id: string;

  // Canvas operations
  push: (canvasId: string, actionId: string, input?: Record<string, unknown>) => string;
  pop: (canvasId: string) => void;
  replace: (canvasId: string, actionId: string, input?: Record<string, unknown>) => string;
  clear: (canvasId: string) => void;

  // State
  getCanvas: (canvasId: string) => CanvasState;
  getRuntime: (instanceId: string) => ActionRuntime | undefined;

  // Observation
  onStateChange: (handler: StateChangeHandler) => Unsubscribe;
  onDataChange: (handler: DataChangeHandler) => Unsubscribe;

  dispose: () => void;
};
```

### Canvas

```typescript
type CanvasState = {
  id: string;
  stack: ActionInstance[];
  active: ActionInstance | undefined;
};
```

- **push**: mount new action, suspend current top
- **pop**: unmount top, resume previous
- **replace**: unmount top, mount new
- **clear**: unmount all

### Message Bus

Inter-action communication:

```typescript
type MessageBus = {
  send: (from: string, to: string, payload: unknown) => void;
  subscribe: (channel: string, handler: ChannelHandler) => Unsubscribe;
  publish: (channel: string, payload: unknown) => void;
};
```

Triggers with `emit` publish to channels. Triggers with `message` subscribe to channels.

### Telemetry

Shell observation via hooks on config:

```typescript
const shell = createShell({
  canvases: ['main', 'sidebar'],
  telemetry: {
    onStateChange: (snapshot) => { ... },
    onDataChange: (change) => { ... },
  },
});
```

### Wire Protocol

For server-authoritative UX:

```typescript
type UICommandBatch = {
  batchId: string;
  serverSeq: number;
  commands: UICommand[];
};

type UICommand =
  | { type: 'push'; canvasId: string; actionId: string; data?: Record<string, unknown> }
  | { type: 'pop'; canvasId: string }
  | { type: 'replace'; canvasId: string; actionId: string; data?: Record<string, unknown> }
  | { type: 'mergeData'; instanceId: string; updates: Record<string, unknown> }
  | { type: 'replaceData'; instanceId: string; data: Record<string, unknown> }
  | { type: 'clearCanvas'; canvasId: string };

type ClientEventEnvelope = {
  sessionId: string;
  shellId: string;
  clientSeq: number;
  events: ClientEvent[];
};
```

---

## Transform Injection (Prism Integration)

Nova accepts an optional `transform` function for data transformation:

```typescript
const shell = createShell({
  canvases: ['main'],
  transform: evaluate,  // from @niscorp/prism
}, { registry, actions });
```

Type:
```typescript
type TransformFn = (config: unknown, source: Record<string, unknown>) => unknown;
```

Used in:
- **Action data initialization** — transform input before merging with defaults
- **Endpoint response mapping** — transform API responses before storing
- **Trigger effects** — transform values before applying ops

If not provided, these features are unavailable (plain data pass-through). Zero coupling with Prism — any function matching the signature works.

---

## React Adapter

The only React-dependent code. ~200 lines total.

### Hooks

```typescript
useShell()             → Shell from context
useCanvas(id)          → CanvasState (re-renders on change)
useActionData()        → current action's data (re-renders on change)
useActionRuntime()     → { data, updateData, applyMutations, executeSteps, unmount }
```

### Providers

```typescript
<ShellProvider shell={shell} registry={reactRegistry}>
  <CanvasSlot canvasId="main" />
  <CanvasSlot canvasId="sidebar" />
</ShellProvider>
```

`CanvasSlot` subscribes to the canvas state, gets the active action's runtime, calls `runtime.render()` to get `RenderNode[]`, converts to React elements via the adapter.

### React Component Registry

The core `ComponentRegistry` stores `ComponentEntry` with framework-agnostic `meta`. The React adapter maintains a parallel map of `name → React.ComponentType` for the `toReact` conversion.

```typescript
const reactRegistry = createReactRegistry(coreRegistry);
reactRegistry.register('Stack', StackComponent);
reactRegistry.register('Text', TextComponent);
// or use the built-in adapter
builtinReactAdapter.register(reactRegistry);
```

---

## Headless Primitives

Built-in React components. Render semantic HTML with data attributes. Unstyled.

| Component | Props | Purpose |
|-----------|-------|---------|
| `Stack` | `direction`, `gap`, `align`, `justify`, `wrap` | Flex layout |
| `Text` | `variant`, `weight`, `align` | Text display |
| `Button` | `text`, `variant`, `disabled`, `loading` | Interactive button |
| `Input` | `value`, `placeholder`, `type`, `disabled` | Text input |
| `Select` | `value`, `options`, `placeholder` | Dropdown |
| `Textarea` | `value`, `placeholder`, `rows` | Multi-line input |
| `Image` | `src`, `alt`, `fit`, `fallback` | Image display |
| `Surface` | `padding`, `elevation`, `rounded` | Container/card |
| `Scroll` | `direction`, `maxHeight` | Scrollable area |
| `Collapsible` | `open`, `title` | Expand/collapse |
| `Spinner` | `size` | Loading indicator |
| `Divider` | `orientation` | Separator |
| `Badge` | `text`, `variant` | Status badge |

---

## Package Entry Points

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./react": "./dist/react/index.js",
    "./components": "./dist/components/index.js",
    "./protocol": "./dist/protocol/index.js"
  }
}
```

- `@niscorp/nova` — Pure TypeScript core (layout, action, shell). Zero React dep.
- `@niscorp/nova/react` — React adapter (hooks, providers, renderer)
- `@niscorp/nova/components` — Headless React primitives
- `@niscorp/nova/protocol` — Wire protocol types and apply function

---

## File Structure

```
src/
├── index.ts                           # Core barrel
│
├── layout/
│   ├── index.ts
│   ├── types.ts                       # LayoutNode, Binding, RenderNode, ComponentMeta
│   ├── schemas.ts                     # Zod schemas
│   ├── guards.ts                      # Type guards
│   ├── renderer.ts                    # JSON → RenderNode[] (framework-agnostic)
│   ├── binding-resolver.ts            # Binding evaluation
│   ├── scope.ts                       # Scope chain
│   ├── store.ts                       # Layout store
│   ├── registry.ts                    # Component registry
│   ├── event-bus.ts                   # UI event pub/sub
│   └── agent.ts                       # LLM prompt + validation helpers
│
├── action/
│   ├── index.ts
│   ├── types.ts                       # ActionDefinition, Mutation, Step, TriggerConfig, etc.
│   ├── schemas.ts                     # Zod schemas
│   ├── runtime/
│   │   ├── runtime.ts                 # createActionRuntime factory
│   │   ├── lifecycle.ts               # mount, suspend, resume, complete, cancel
│   │   ├── data.ts                    # data management, ops execution
│   │   ├── triggers.ts               # trigger matching + effect execution
│   │   └── endpoints.ts              # HTTP calls with template resolution
│   └── mutations.ts                   # Mutation registry (set, toggle, push, etc.)
│
├── shell/
│   ├── index.ts
│   ├── types.ts                       # Shell, CanvasState
│   ├── shell.ts                       # createShell factory
│   ├── canvas.ts                      # Canvas stack operations
│   └── message-bus.ts                 # Inter-action messaging
│
├── react/
│   ├── index.ts
│   ├── adapter.tsx                    # RenderNode[] → React.ReactNode
│   ├── shell-provider.tsx             # ShellProvider context
│   ├── canvas-slot.tsx                # CanvasSlot component
│   ├── hooks.ts                       # useShell, useCanvas, useActionData, useActionRuntime
│   ├── registry.ts                    # React component registry
│   └── error-boundary.tsx
│
├── components/
│   ├── index.ts
│   ├── primitives/                    # Stack, Text, Button, Input, etc.
│   └── adapter.ts                     # Built-in adapter registration
│
└── protocol/
    ├── index.ts
    ├── types.ts                       # UICommandBatch, ClientEventEnvelope
    ├── apply.ts                       # Apply command batch to shell
    └── schemas.ts                     # Zod schemas
```

---

## Dependencies

- `zod` (peer, ^4.0.0) — Schema validation
- `react` (peer, ^19.0.0) — Only for `/react` and `/components` entry points

Core entry point has zero framework dependencies.

---

## Design Decisions

1. **Schema-first.** Every definition is a Zod schema with `.describe()`. Types are inferred. No hand-written types for anything that crosses a boundary.

2. **RenderNode intermediate representation.** Core renderer outputs framework-agnostic nodes. React adapter is ~200 lines. Enables testing without React, and potential Vue/Svelte adapters later.

3. **Three systems, one package.** Layout, action, shell are cohesive. Entry points provide separation without version coordination overhead.

4. **`data` not `initialData`.** Simple merge: `{ ...definition.data, ...input }`. No discriminated `type: 'static' | 'input' | 'mapped'` variants.

5. **Steps = Mutations + Effects.** One ordered array in `do`. Mutations change data, effects touch the outside world. They interleave because real workflows need "set loading, call API, set result."

6. **`do` field everywhere.** Triggers have `do`. Lifecycle hooks have `do`. Same execution model, same step types. One concept to learn.

7. **`call` branches with `onSuccess`/`onError`.** The only branching point. Everything else is sequential. Keeps the model flat for 90% of cases, handles API error flows for the 10%.

8. **No `onComplete`/`onCancel`.** Navigation lives in triggers, not lifecycle. The trigger that causes unmount carries the navigation intent. The action doesn't need to know why it's unmounting.

9. **Four lifecycle events: mount, unmount, suspend, resume.** Real state machine transitions. No invented concepts like "complete" or "cancel."

10. **One trigger schema.** Source + match + do. Not 11 discriminated types.

11. **Transform injection.** Optional `TransformFn` for Prism integration. Zero coupling.

12. **Event bus, not DOM events.** Components emit to the bus. Triggers listen. Decouples component from behavior.

13. **Canvas stacks, not routes.** Push/pop/replace. No router dependency.

14. **Wire protocol for server authority.** Server pushes UI commands, client applies them.

15. **Headless primitives.** Semantic HTML, no styles.

16. **Action runtime is a pure TypeScript state machine.** Framework adapters observe it. The runtime doesn't know about React.
