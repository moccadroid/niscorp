# Design Document: `@niscorp/nova` — Declarative UI Framework

## Purpose

A React framework for building declarative, data-driven interfaces from JSON definitions. Agents generate layouts, the shell orchestrates them, the server controls the UX. The client is a thin renderer.

**One sentence:** JSON layouts, action lifecycles, shell orchestration, server-authoritative UX - built on React, designed for AI agents.

---

## What We Learned

The original UI framework (*neon-ui*) proved the entire concept: JSON layouts rendered by a component registry, actions with lifecycles on canvas stacks, shells that orchestrate multi-panel experiences, and LLM agents that generate all of it. The Cassandra demo was the proof: 10 coordinated actions, real-time inter-action communication, agent-driven layout generation.

### What translates directly to React
- **Layout system concept:** JSON → component tree with bindings, conditionals, loops, refs. The rendering engine is framework-specific but the JSON format is universal.
- **Component registry:** String name → component lookup with metadata. Works identically in React.
- **Action/shell state machine:** Actions have lifecycles (mount → active → suspend → unmount). Canvases are stacks. This is pure state management - framework-agnostic.
- **Message bus:** Inter-action pub/sub communication. Pure TypeScript, no framework dependency.
- **Event bus:** UI event routing (click, input, submit) with ref-based targeting. Same pattern, React events instead of Vue events.
- **Wire protocol:** `UICommandBatch` / `ClientEventEnvelope`. Completely framework-agnostic by design.

### What needs fundamental rethinking for React
- **VNode rendering → React.createElement.** Vue's `h()` function maps to `React.createElement()` but the surrounding patterns differ significantly.
- **Reactive refs → React state.** Vue's `ref()` and `reactive()` have no equivalent. Use React hooks (`useState`, `useReducer`) and context.
- **Composables → Hooks.** Vue composables become React hooks, but lifecycle differences matter (Vue `onMounted` vs React `useEffect`).
- **Directives → nothing.** Vue directives (`v-neon`) don't exist in React. Use wrapper components or hooks instead.
- **Scoped slots → render props / children functions.** Different composition model.
- **Two-way binding → controlled components.** Vue's `v-model` becomes `value` + `onChange` in React.

### New opportunities in React
- **React Server Components (RSC).** Server-side layout rendering for initial paint, then hydrate. This gives us a performance story the original never had.
- **Suspense.** Async data loading during layout rendering can use Suspense boundaries naturally.
- **React Compiler.** Automatic memoization means we don't need to manually optimize re-renders.
- **Concurrent features.** `useTransition`, `useDeferredValue` for non-blocking shell operations.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Shell                              │
│  State machine: canvases, action stacks, lifecycle    │
│  Pure TypeScript (no React dependency)                │
├──────────────────────────────────────────────────────┤
│                    React Integration                  │
│  ShellProvider, CanvasSlot, useShell, useAction, etc. │
├───────────────┬──────────────────────────────────────┤
│  Layout Engine │          Action Runtime              │
│  JSON → React  │  Data, triggers, skills, endpoints   │
│  elements      │  State management + lifecycle        │
├───────────────┴──────────────────────────────────────┤
│                Component Registry                     │
│  String name → React component + metadata             │
│  Built-in headless primitives + custom adapters       │
├──────────────────────────────────────────────────────┤
│                   Event System                        │
│  Event bus (UI events) + Message bus (inter-action)   │
└──────────────────────────────────────────────────────┘
```

---

## System 1: Layout Engine

### Layout Nodes

The JSON format stays the same as the original. This is the contract between agents and the renderer.

```typescript
type LayoutNode =
  | ComponentNode
  | ConditionalNode
  | LoopNode
  | LayoutRefNode
  | LayoutNode[]
  | LayoutPrimitive;

type LayoutPrimitive = string | number | boolean | null;
```

#### Component Node

```typescript
type ComponentNode = {
  component: string;                   // Registry name (e.g., 'Stack', 'Text', 'Button')
  props?: Record<string, Binding | unknown>;
  children?: LayoutContent | LayoutContent[];
  ref?: string;                        // Event targeting ID
  model?: string;                      // Two-way binding path (e.g., '$.name')
  events?: Record<string, EventConfig>;
};
```

#### Conditional Node

```typescript
type ConditionalNode = {
  if: Binding;
  then: LayoutNode;
  else?: LayoutNode;
};
```

#### Loop Node

```typescript
type LoopNode = {
  for: Binding;                        // Array to iterate
  as: string;                          // Variable name for each item
  do: LayoutNode;                      // Template for each item
  key?: string;                        // Key expression for React list rendering
};
```

#### Layout Reference

```typescript
type LayoutRefNode = {
  ref: string;                         // Layout ID or data path ($.contentLayout)
};
```

### Bindings

Three types, same as the original:

```typescript
// Path binding - resolves against data context
'$.user.name'                          // Data path
'$item.label'                          // Loop variable

// Template binding - string interpolation
{ template: 'Hello {{$.user.name}}, you have {{$.count}} items' }

// Conditional binding - ternary
{ if: '$.isPremium', then: 'Premium', else: 'Free' }
```

### Rendering Engine

The renderer converts layout JSON to React elements:

```typescript
export const createLayoutRenderer = (config: RendererConfig): LayoutRenderer;

type RendererConfig = {
  registry: ComponentRegistry;
  eventBus?: EventBus;
  layoutStore?: LayoutStore;
};

type LayoutRenderer = {
  render: (layout: LayoutNode, data: Record<string, unknown>) => React.ReactNode;
};
```

#### Rendering Algorithm

```typescript
const renderNode = (node: LayoutNode, scopeChain: ScopeChain): React.ReactNode => {
  // Primitives → text
  if (node === null || typeof node !== 'object') return String(node ?? '');

  // Arrays → fragment of rendered children
  if (Array.isArray(node)) return node.map((child, i) => renderNode(child, scopeChain));

  // Conditional → evaluate condition, render then/else
  if (isConditionalNode(node)) {
    const condition = resolveBinding(node.if, scopeChain);
    return condition ? renderNode(node.then, scopeChain) : node.else ? renderNode(node.else, scopeChain) : null;
  }

  // Loop → iterate, push scope for each item, render template
  if (isLoopNode(node)) {
    const items = resolveBinding(node.for, scopeChain);
    if (!Array.isArray(items)) return null;
    return items.map((item, index) => {
      const loopScope = pushScope(scopeChain, { [node.as]: item, $index: index });
      const key = node.key ? String(resolveBinding(node.key, loopScope)) : String(index);
      return <React.Fragment key={key}>{renderNode(node.do, loopScope)}</React.Fragment>;
    });
  }

  // Layout ref → resolve ID, look up in store, render
  if (isLayoutRefNode(node)) {
    return <LayoutRef refValue={node.ref} scopeChain={scopeChain} />;
  }

  // Component → resolve props, create element
  if (isComponentNode(node)) {
    return <ComponentRenderer node={node} scopeChain={scopeChain} />;
  }

  return null;
};
```

#### Component Resolution

```typescript
const ComponentRenderer = ({ node, scopeChain }: Props) => {
  const registry = useComponentRegistry();
  const entry = registry.get(node.component);
  if (!entry) return <UnknownComponent name={node.component} />;

  // Resolve props (evaluate bindings)
  const resolvedProps = resolveProps(node.props, scopeChain);

  // Handle model binding (two-way)
  if (node.model) {
    const modelPath = node.model;
    const currentValue = resolveBinding(modelPath, scopeChain);
    resolvedProps.value = currentValue;
    resolvedProps.onChange = (newValue: unknown) => {
      eventBus.emit({ type: 'ui:model', ref: node.ref, path: modelPath, value: newValue });
    };
  }

  // Handle events
  if (node.events) {
    for (const [eventName, config] of Object.entries(node.events)) {
      resolvedProps[eventName] = (eventData: unknown) => {
        eventBus.emit({ type: `ui:${eventName}`, ref: node.ref, data: eventData });
      };
    }
  }

  // Render children
  const children = node.children
    ? renderChildren(node.children, scopeChain)
    : undefined;

  return React.createElement(entry.component, resolvedProps, children);
};
```

### Scope Chain

Data context uses a scope chain for nested bindings (loop variables, etc.):

```typescript
type ScopeChain = Record<string, unknown>[];

// Push scope for loop iteration
const pushScope = (chain: ScopeChain, scope: Record<string, unknown>): ScopeChain =>
  [scope, ...chain];

// Resolve binding: walk chain from innermost to outermost
const resolveBinding = (binding: Binding, chain: ScopeChain): unknown => {
  if (isPathString(binding)) return resolvePath(binding, chain);
  if (isTemplateBinding(binding)) return resolveTemplate(binding, chain);
  if (isConditionalBinding(binding)) return resolveConditional(binding, chain);
  return binding;
};
```

---

## System 2: Component Registry

### Registry Interface

```typescript
type ComponentRegistry = {
  register: (name: string, entry: ComponentEntry) => void;
  get: (name: string) => ComponentEntry | undefined;
  list: () => string[];
  has: (name: string) => boolean;
  getCatalog: () => ComponentCatalog;         // For LLM consumption
  getJsonSchema: () => object;                // JSON Schema of all components
};

type ComponentEntry = {
  component: React.ComponentType<any>;        // The React component
  meta: ComponentMeta;                        // Metadata for the registry
};

type ComponentMeta = {
  name: string;
  description: string;
  category: string;
  props: Record<string, PropMeta>;
  events?: Record<string, EventMeta>;
  slots?: Record<string, SlotMeta>;
};

type PropMeta = {
  type: string;                               // 'string', 'number', 'boolean', etc.
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];                           // Allowed values
};
```

### Adapter Pattern

Custom component libraries register through adapters:

```typescript
// Create adapter for a component library
export const createAdapter = (components: AdapterComponent[]): ComponentAdapter;

type AdapterComponent = {
  name: string;
  component: React.ComponentType;
  meta: ComponentMeta;
};

type ComponentAdapter = {
  register: (registry: ComponentRegistry) => void;
};
```

### Built-in Headless Primitives

Ship a set of **headless** (unstyled) primitives that work with any design system:

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `Stack` | Flex layout | `direction`, `gap`, `align`, `justify`, `wrap` |
| `Text` | Text rendering | `variant` (display/heading/body/caption/label), `weight`, `align` |
| `Button` | Interactive button | `text`, `variant`, `disabled`, `loading` |
| `Input` | Text input | `value`, `placeholder`, `type`, `disabled` |
| `Select` | Dropdown select | `value`, `options`, `placeholder` |
| `Textarea` | Multi-line input | `value`, `placeholder`, `rows` |
| `Image` | Image display | `src`, `alt`, `fit`, `fallback` |
| `Surface` | Container/card | `padding`, `elevation`, `rounded` |
| `Scroll` | Scrollable area | `direction`, `maxHeight` |
| `Collapsible` | Expand/collapse | `open`, `title` |
| `Spinner` | Loading indicator | `size` |
| `Divider` | Visual separator | `orientation` |
| `Badge` | Status badge | `text`, `variant` |

These are headless by default - they render semantic HTML with data attributes for styling. Users style them with CSS, Tailwind, or any approach.

Optional: ship a Tailwind preset that styles all headless primitives with a clean default look.

---

## System 3: Action System

### Action Definition (JSON)

```typescript
type ActionDefinition = {
  id: string;
  name?: string;
  description?: string;

  // Layout
  layout: string | LayoutNode;         // Layout ID or inline layout

  // Data
  inputSchema?: z.ZodType;             // Expected input shape
  outputSchema?: z.ZodType;            // Expected output shape
  initialData?: InitialDataConfig;     // How to initialize action data

  // Behavior
  triggers?: TriggerConfig[];          // Event handlers
  endpoints?: Record<string, EndpointConfig>;
  lifecycle?: LifecycleConfig;         // onMount, onResume hooks

  // Completion
  onComplete?: CompletionBehavior;     // What happens when action completes
  onCancel?: CancellationBehavior;
};
```

### Action Instance (Runtime)

```typescript
type ActionInstance = {
  id: string;                          // Unique instance ID
  definitionId: string;                // Reference to definition
  canvasId: string;                    // Where it's rendered
  status: ActionStatus;                // Lifecycle state
  input: unknown;                      // Input data
  data: Record<string, unknown>;       // Reactive state
};

type ActionStatus = 'initializing' | 'active' | 'suspended' | 'completing' | 'unmounted';
```

### Triggers

Triggers bind UI events or messages to effects:

```typescript
type TriggerConfig = EventTrigger | MessageTrigger;

type EventTrigger = {
  event: string;                       // 'ui:click', 'ui:submit', 'ui:input', etc.
  ref?: string;                        // Component ref (if omitted, matches any)
  skills?: SkillConfig[];              // State mutations
  call?: string;                       // Endpoint to call
  push?: { action: string; input?: Record<string, Binding> };
  pop?: boolean;
  replace?: { action: string; input?: Record<string, Binding> };
  emit?: { channel: string; payload?: Record<string, Binding> };
};

type MessageTrigger = {
  message: string;                     // Channel name
  skills?: SkillConfig[];
  call?: string;
};
```

### Skills (State Operations)

Atomic, declarative state mutations:

```typescript
type SkillConfig =
  | { set: string; value: unknown }              // Set field to literal
  | { set: string; from: string }                // Set field from another path
  | { toggle: string }                           // Toggle boolean
  | { increment: string; by?: number; max?: number }
  | { decrement: string; by?: number; min?: number }
  | { push: string; value?: unknown; from?: string }  // Push to array
  | { pop: string }                              // Pop from array
  | { removeAt: string; index: number }          // Remove at index
  | { clear: string }                            // Clear array/object
  | { reset: string }                            // Reset to initial value
  | { merge: string; value: Record<string, unknown> }; // Shallow merge
```

Skills are applied in order. Each produces a new state (immutable updates).

### Endpoints

Named HTTP calls defined in action definitions:

```typescript
type EndpointConfig = {
  url: string;                         // Template URL: '/api/users/{{$.userId}}'
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Record<string, Binding>;  // Path or mapped object
  target?: string;                     // Store response at this data path
  errorTarget?: string;                // Store error at this path
};
```

---

## System 4: Shell

The shell is a state machine that manages canvases and action lifecycles. It is **pure TypeScript** - no React dependency. React integration is via hooks and providers.

### Shell (Pure TypeScript)

```typescript
type Shell = {
  readonly id: string;

  // Canvas operations
  push: (canvasId: string, actionId: string, input?: unknown) => string;    // Returns instance ID
  pop: (canvasId: string) => void;
  replace: (canvasId: string, actionId: string, input?: unknown) => string;
  clear: (canvasId: string) => void;

  // State access
  getCanvas: (canvasId: string) => CanvasState;
  getAction: (instanceId: string) => ActionInstance | undefined;
  getActionData: (instanceId: string) => Record<string, unknown>;
  updateActionData: (instanceId: string, updates: Record<string, unknown>) => void;

  // Events
  onStateChange: (handler: StateChangeHandler) => Unsubscribe;
  onActionDataChange: (handler: DataChangeHandler) => Unsubscribe;

  // Lifecycle
  dispose: () => void;
};

type CanvasState = {
  id: string;
  stack: ActionInstance[];              // Bottom to top
  activeInstance: ActionInstance | undefined;  // Top of stack
};
```

### React Integration (Hooks)

```typescript
// Provide shell context to React tree
export const ShellProvider: React.FC<{ shell: Shell; children: React.ReactNode }>;

// Access shell from any component
export const useShell: () => Shell;

// Render a canvas
export const CanvasSlot: React.FC<{ canvasId: string }>;

// Access current action's data
export const useActionData: () => Record<string, unknown>;

// Access action runtime (data + operations)
export const useActionRuntime: () => ActionRuntime;

type ActionRuntime = {
  data: Record<string, unknown>;
  updateData: (updates: Record<string, unknown>) => void;
  callEndpoint: (name: string) => Promise<unknown>;
  complete: (output?: unknown) => void;
  cancel: () => void;
};
```

### Canvas Rendering

```typescript
const CanvasSlot: React.FC<{ canvasId: string }> = ({ canvasId }) => {
  const shell = useShell();
  const canvas = useCanvasState(canvasId);

  if (!canvas?.activeInstance) return null;

  const instance = canvas.activeInstance;
  const definition = shell.getDefinition(instance.definitionId);
  const layout = resolveLayout(definition.layout);

  return (
    <ActionProvider instance={instance} definition={definition}>
      <LayoutRenderer layout={layout} data={instance.data} />
    </ActionProvider>
  );
};
```

---

## System 5: Wire Protocol (Server-Authoritative)

The protocol for server → client UI commands and client → server events. Framework-agnostic by design.

### Server → Client: `UICommandBatch`

```typescript
type UICommandBatch = {
  batchId: string;
  sessionId: string;
  serverSeq: number;                   // Monotonic sequence for ordering
  commands: UICommand[];
};

type UICommand =
  | { type: 'push'; canvasId: string; actionId: string; layout: LayoutNode; data: Record<string, unknown> }
  | { type: 'replace'; canvasId: string; actionId: string; layout: LayoutNode; data: Record<string, unknown> }
  | { type: 'pop'; canvasId: string }
  | { type: 'mergeData'; instanceId: string; updates: Record<string, unknown> }
  | { type: 'replaceData'; instanceId: string; data: Record<string, unknown> }
  | { type: 'clearCanvas'; canvasId: string };
```

### Client → Server: `ClientEventEnvelope`

```typescript
type ClientEventEnvelope = {
  sessionId: string;
  shellId: string;
  clientSeq: number;
  events: ClientEvent[];
};

type ClientEvent = {
  type: string;                        // 'click', 'submit', 'change', 'custom', etc.
  ref?: string;                        // Component ref
  canvasId: string;
  instanceId: string;
  payload?: unknown;
  timestamp: number;
};
```

### Applying Commands

```typescript
export const applyCommandBatch = (shell: Shell, batch: UICommandBatch): void => {
  for (const command of batch.commands) {
    switch (command.type) {
      case 'push':
        shell.push(command.canvasId, command.actionId, command.data);
        break;
      case 'pop':
        shell.pop(command.canvasId);
        break;
      case 'mergeData':
        shell.updateActionData(command.instanceId, command.updates);
        break;
      // ... etc
    }
  }
};
```

---

## Event System

### Event Bus (UI Events)

Handles events within a single action: click, input, submit, focus, blur, model changes.

```typescript
type EventBus = {
  emit: (event: UIEvent) => void;
  on: (type: string, handler: UIEventHandler) => Unsubscribe;
  onRef: (ref: string, type: string, handler: UIEventHandler) => Unsubscribe;
};

type UIEvent = {
  type: string;                        // 'ui:click', 'ui:input', 'ui:submit', 'ui:model'
  ref?: string;                        // Component ref
  value?: unknown;                     // Event value (input value, etc.)
  data?: Record<string, unknown>;      // Additional event data
};
```

### Message Bus (Inter-Action)

Handles communication between actions across canvases:

```typescript
type MessageBus = {
  send: (from: Address, to: Address, payload: unknown) => void;
  subscribe: (channel: string, handler: ChannelHandler) => Unsubscribe;
  publish: (channel: string, payload: unknown) => void;
};

type Address = {
  shell: string;
  canvas?: string;
  action?: string;
};
```

---

## Layout Store

Versioned layout storage with reference resolution:

```typescript
type LayoutStore = {
  get: (id: string) => LayoutNode | undefined;
  set: (id: string, layout: LayoutNode) => void;
  delete: (id: string) => void;
  list: () => string[];
  resolveReferences: (layout: LayoutNode) => LayoutNode;
};
```

Layout references (`{ ref: 'layout-id' }`) are resolved by looking up the ID in the store. Dynamic refs (`{ ref: '$.contentLayout' }`) are resolved at render time against the data context.

---

## Agent Integration

### Layout Generation Prompt

```typescript
export const generateLayoutPrompt = (registry: ComponentRegistry): string => {
  const catalog = registry.getCatalog();
  return `You generate JSON layouts using these components:\n${JSON.stringify(catalog, null, 2)}\n\nRules:\n- Use component names exactly as listed\n- Props must match the documented types\n- Use bindings ($.path) for dynamic data\n...`;
};
```

### Action Generation Prompt

```typescript
export const generateActionPrompt = (options: { components: ComponentCatalog; skills: SkillInfo[] }): string => {
  // Produces a prompt that teaches the LLM how to generate action definitions
};
```

### Validation

```typescript
export const validateLayout = (layout: unknown): ValidationResult => {
  return LayoutNodeSchema.safeParse(layout);
};

export const validateAction = (definition: unknown): ValidationResult => {
  return ActionDefinitionSchema.safeParse(definition);
};
```

---

## File Structure

```
src/
├── index.ts                           # Public API barrel
│
├── layout/                            # System 1: Layout Engine
│   ├── index.ts
│   ├── types.ts                       # LayoutNode, Binding, etc.
│   ├── schemas.ts                     # Zod schemas for all layout types
│   ├── renderer.ts                    # createLayoutRenderer
│   ├── binding-resolver.ts            # Binding resolution logic
│   ├── scope.ts                       # ScopeChain utilities
│   ├── store.ts                       # Layout store with versioning
│   └── agent.ts                       # LLM prompt generation + validation
│
├── registry/                          # System 2: Component Registry
│   ├── index.ts
│   ├── types.ts                       # ComponentEntry, ComponentMeta, etc.
│   ├── registry.ts                    # createComponentRegistry
│   ├── adapter.ts                     # createAdapter factory
│   └── catalog.ts                     # Catalog + JSON Schema generation
│
├── components/                        # Built-in headless primitives
│   ├── index.ts
│   ├── stack.tsx
│   ├── text.tsx
│   ├── button.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── textarea.tsx
│   ├── image.tsx
│   ├── surface.tsx
│   ├── scroll.tsx
│   ├── collapsible.tsx
│   ├── spinner.tsx
│   ├── divider.tsx
│   ├── badge.tsx
│   └── adapter.ts                     # Built-in adapter registration
│
├── action/                            # System 3: Actions
│   ├── index.ts
│   ├── types.ts                       # ActionDefinition, ActionInstance, etc.
│   ├── schemas.ts                     # Zod schemas for actions
│   ├── runtime.ts                     # Action runtime (data, triggers, endpoints)
│   ├── skills.ts                      # Skill execution engine
│   ├── triggers.ts                    # Trigger matching and execution
│   └── endpoints.ts                   # HTTP endpoint calling
│
├── shell/                             # System 4: Shell (pure TS)
│   ├── index.ts
│   ├── types.ts                       # Shell, CanvasState, etc.
│   ├── shell.ts                       # createShell factory
│   ├── canvas.ts                      # Canvas stack operations
│   └── lifecycle.ts                   # Action lifecycle management
│
├── react/                             # React Integration
│   ├── index.ts
│   ├── shell-provider.tsx             # ShellProvider context
│   ├── canvas-slot.tsx                # CanvasSlot renderer
│   ├── action-provider.tsx            # ActionProvider context
│   ├── hooks.ts                       # useShell, useActionData, useActionRuntime
│   ├── layout-renderer.tsx            # React layout rendering component
│   └── error-boundary.tsx             # Layout error boundary
│
├── events/                            # System 5: Events
│   ├── index.ts
│   ├── event-bus.ts                   # UI event bus
│   └── message-bus.ts                 # Inter-action message bus
│
├── protocol/                          # Wire Protocol
│   ├── index.ts
│   ├── types.ts                       # UICommandBatch, ClientEventEnvelope
│   ├── apply.ts                       # Apply command batch to shell
│   └── schemas.ts                     # Zod schemas for protocol types
│
└── utils/
    ├── path.ts                        # Path parsing, binding utilities
    ├── type-guards.ts                 # isComponentNode, isBinding, etc.
    └── id.ts                          # ID generation
```

### Package Exports

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

Separate entry points so:
- `@niscorp/nova` - Core (layout, registry, action, shell, events) - no React dependency
- `@niscorp/nova/react` - React integration (hooks, providers, renderer)
- `@niscorp/nova/components` - Built-in headless primitives
- `@niscorp/nova/protocol` - Wire protocol types and utilities

---

## Dependencies

- `react` (peer, ^19.0.0) - For React integration entry point
- `zod` (peer, ^4.0.0) - Schema validation

The core (`layout`, `registry`, `action`, `shell`, `events`) has ZERO dependencies. Pure TypeScript. This means the shell state machine can run on the server without React.

---

## Key Design Decisions

1. **Why separate core from React integration?** The shell, action state machine, and event system are framework-agnostic. They should run on the server (for server-authoritative UX) without React. Only the rendering layer needs React.

2. **Why headless primitives instead of styled components?** Adoption. Styled components force a design system. Headless components work with any design system - Tailwind, CSS modules, styled-components, whatever. Ship the structure, let users own the style.

3. **Why keep the JSON layout format from the original?** It works. Agents already know how to generate it (proven in Cassandra demo). It's simple, composable, and covers all UI patterns. Changing it would lose proven ground for no gain.

4. **Why scope chains instead of a flat data context?** Loop variables. When you have `{ for: '$.items', as: 'item', do: { component: 'Text', children: ['$item.name'] } }`, the inner template needs access to both `$item` (loop variable) and `$.user` (parent data). Scope chains handle this naturally by pushing a new scope for each loop and resolving from innermost to outermost.

5. **Why skills instead of arbitrary state mutation?** Predictability. Skills are a closed set of operations (set, toggle, increment, push, etc.). They can be validated, serialized, replayed, and generated by AI. Arbitrary mutation functions (like Redux reducers) can't be serialized or generated from JSON.

6. **Why a wire protocol instead of just WebSocket messages?** Contract. The protocol defines exactly what the server can tell the client to do (push, pop, mergeData, etc.) and exactly what the client can report back (click, submit, change, etc.). Both sides can be implemented independently. The protocol is versionable. New command types can be added without breaking existing clients.

7. **Why `React.createElement` instead of JSX in the renderer?** The renderer is dynamic - it creates elements from JSON at runtime. JSX is compile-time sugar. `React.createElement(registry.get(name).component, resolvedProps, children)` is the natural way to create elements from runtime data.

8. **Why React 19 as minimum?** RSC support, `use()` hook, improved Suspense, Actions for form handling. These are too valuable to leave on the table. React 18 compatibility would constrain the design unnecessarily.
