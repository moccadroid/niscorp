# Layout — Author Guide

How to write nova layouts. A layout is a JSON tree describing what to render. The renderer walks it, resolves any bindings against a data object, and emits a `RenderNode[]` tree that a framework adapter (the React adapter ships with nova) turns into actual UI.

This guide is for **authoring** layouts. For the architecture (why it's JSON, how the unified resolver works, etc.) see `DESIGN.md`.

---

## A first layout

```ts
import { renderLayout, createComponentRegistry, createLayoutStore } from '@niscorp/nova';
import { registerNovaReactComponents } from '@niscorp/nova/react/components';

const registry = createComponentRegistry();
registerNovaReactComponents(registry);
const store = createLayoutStore();

const layout = {
  component: 'Stack',
  props: { direction: 'column', gap: 16, padding: 24 },
  children: [
    { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Hello, {{$.name}}' },
    { component: 'Text', children: 'You have {{$.count}} new messages.' },
  ],
};

const data = { name: 'Ada', count: 3 };

const nodes = renderLayout(layout, data, {
  store,
  registry,
  strict: false,
  onError: console.error,
});
```

`nodes` is a `RenderNode[]` tree. Hand it to the React adapter (`<RenderTree nodes={nodes} />`) and it renders.

## Six node kinds

A `LayoutNode` is one of:

| Kind | What it does |
|---|---|
| **Component** | Instantiates a registered component |
| **Conditional** | Renders one of two branches based on a condition |
| **Loop** | Iterates an array and renders the body for each item |
| **LayoutRef** | Inlines another layout from the layout store |
| **Slot** | A placeholder a fragment-merge fills with the composing action's layout |
| **Primitive** | A bare string/number/boolean — rendered as text |

Plus arrays of any of the above (treated as a fragment).

That's it. Six things. Everything you write is a tree of those.

---

## Component nodes

The most common one. References a component by name; the registry supplies the implementation.

```ts
{
  component: 'Stack',
  props: { direction: 'row', gap: 8 },
  children: [
    { component: 'Text', children: 'left' },
    { component: 'Text', children: 'right' },
  ],
  ref: 'header-stack',          // optional — used by triggers and model binding
  model: '$.draftValue',        // optional — two-way data binding (see below)
}
```

### Fields

- **`component`** *(required)* — the registry name. Must match a name passed to `registry.register(name, ...)`.
- **`props`** *(optional)* — an object of props. **Every value is a binding** — strings starting with `$` are resolved as paths, strings with `{{...}}` are interpolated, plain values pass through. See [Bindings](#bindings).
- **`children`** *(optional)* — a single `LayoutNode` or an array of them. Components decide how to render their children slot.
- **`ref`** *(optional)* — a stable identifier. Used by triggers (`event: 'ui:click', ref: 'header-stack'`) and as the model binding key. If unset, the renderer auto-generates one for model-bound components.
- **`model`** *(optional)* — two-way binding path. See [Two-way binding](#two-way-binding).

### Resolved render output

A component node renders to a `RenderNode` of type `'component'`:

```ts
{
  type: 'component',
  name: 'Stack',
  props: { direction: 'row', gap: 8 },     // values resolved against the data
  children: [...],                          // recursive RenderNode[]
  ref: 'header-stack',                      // if set on the source node
  model: { ref: 'header-stack', path: 'draftValue' },  // if model was set
}
```

The framework adapter (React) reads this and instantiates the React component with these props.

---

## Conditional nodes

Render one of two branches based on a condition.

```ts
{
  if: '$.user.isLoggedIn',
  then: { component: 'Text', children: 'Welcome back, {{$.user.name}}' },
  else: { component: 'Text', children: 'Please log in.' },
}
```

### Fields

- **`if`** *(required)* — a binding evaluated for truthiness. Strings are bindings, primitives are themselves, objects can be `{$if}` directives. Truthiness rules: `null`, `undefined`, `false`, `0`, `''`, `[]`, `{}` are all falsy. Everything else is truthy.
- **`then`** *(required)* — `LayoutNode` rendered when the condition is truthy.
- **`else`** *(optional)* — `LayoutNode` rendered when the condition is falsy. If absent, an empty fragment is rendered.

### Conditionals inside other places

There are **two kinds of conditional** in nova:

1. **Conditional NODE** (this one) — appears in the layout tree as a sibling of components. Swaps whole subtrees.
2. **`{$if}` directive** — appears inside a value position (e.g. a prop value, a string content). See [Bindings — directives](#directives).

Use the node form when you're swapping whole UI sections. Use the directive form when you're picking a value for a single field.

---

## Loop nodes

Iterate an array and render the body once per item.

```ts
{
  for: '$.users',
  as: 'user',
  do: {
    component: 'Stack',
    props: { direction: 'row', gap: 8 },
    children: [
      { component: 'Text', children: '{{$user.name}}' },
      { component: 'Text', children: '({{$user.email}})' },
    ],
  },
}
```

### Fields

- **`for`** *(required)* — a binding that resolves to an array. If it doesn't resolve to an array, the loop renders nothing (graceful empty).
- **`as`** *(required)* — the variable name used for the current item inside `do`. References as `$<name>` (no dot).
- **`key`** *(optional)* — a path on each item used for stable React keys when an adapter consumes the output. Currently informational; the React adapter falls back to index-based keys.
- **`do`** *(required)* — the `LayoutNode` rendered once per item, with the loop variable in scope.

### The `index` variable

Inside the loop body, the variable `index` is automatically bound to the current iteration index (0-based). Reference it as `$index`:

```ts
{
  for: '$.items',
  as: 'item',
  do: { component: 'Text', children: '{{$index}}. {{$item.name}}' },
}
```

### Empty arrays

If `for` resolves to `[]`, the loop renders nothing. To show fallback content, wrap the loop in a conditional:

```ts
{
  if: '$.items.length',
  then: { for: '$.items', as: 'item', do: { component: 'Text', children: '{{$item.name}}' } },
  else: { component: 'Text', children: 'No items yet.' },
}
```

---

## Layout refs

Reuse a stored layout by id. The referenced layout is inlined at the ref position with the current scope chain intact.

```ts
// Pre-populate the layout store:
store.set('user-card', {
  component: 'Box',
  props: { padding: 16, background: '#eef2ff', radius: 8 },
  children: [
    { component: 'Text', props: { weight: 'bold' }, children: '{{$.name}}' },
    { component: 'Text', children: '{{$.email}}' },
  ],
});

// Use it from a layout:
{
  component: 'Stack',
  children: [
    { ref: 'user-card' },
    { ref: 'user-card' },
  ],
}
```

### Fields

- **`ref`** *(required)* — id of a layout previously stored via `store.set(id, layoutNode)`.

### Behavior

- The referenced layout sees the **current scope** at the call site. Inside a loop, a `LayoutRef` reads from the loop variable just like an inline layout would.
- If the ref doesn't resolve, the renderer throws `LayoutRefNotFoundError`. In lax mode it's caught and replaced with an error RenderNode; in strict mode it propagates.

---

## Slots

A placeholder that a fragment-merge fills.

```ts
{ slot: 'body' }
```

Only meaningful inside an `ActionFragment`'s layout: when a fragment is composed with an action (a push/replace `with: [...]`), the fragment's `{ slot: 'body' }` node is replaced by the composing action's own layout. An unfilled slot renders nothing. See `ACTION_DOCS.md` for fragments.

(The shell's canvas layouts use registered slot *components* — `CanvasSlot` / `ActionSlot` — which are ordinary component nodes, not this node kind.)

---

## Primitives

Bare strings, numbers, booleans, and `null` are valid layout nodes. They render as text content.

```ts
'Hello, world!'                  // → text 'Hello, world!'
42                                // → text '42'
true                              // → text 'true'
null                              // → empty text
'Welcome, {{$.name}}!'            // → text with interpolation
'$.message'                       // → text resolved from data
```

Strings get full binding treatment — templates and bare paths both work. This is how text content typically appears as the children of a component.

---

## Bindings

The single most important concept. Every value in a layout that could be data-driven goes through the same resolver. There are three forms.

### 1. Bare path strings

A string starting with `$.` reads a value from the data object.

```ts
'$.user.name'              // → data.user.name (raw value, type preserved)
'$.user.email'
'$.items.length'           // → array length
'$item.name'               // → reads `name` from the variable `item` in scope
'$index'                   // → loop iteration index
```

The raw value is returned with its type preserved — numbers stay numbers, arrays stay arrays.

**Path forms:**
- `$.foo.bar` — start from the data root, walk `foo` then `bar`
- `$foo` — read variable `foo` from the closest enclosing scope (loop variable, etc.)
- `$foo.bar` — read variable `foo`, walk `bar` on it
- `$index` — special: the loop iteration index

### 2. Template strings

A string with `{{...}}` patterns interpolates each expression and returns a string.

```ts
'Hello, {{$.user.name}}!'                      // → "Hello, Ada!"
'{{$.count}} items remaining'                   // → "3 items remaining"
'{{$.first}} {{$.last}}'                        // → "Ada Lovelace"
```

Each `{{expr}}` is resolved against the scope and stringified. Numbers, booleans become their string form. Objects/arrays become JSON.

A string that is **exactly** `{{ expr }}` (one expression, nothing else) preserves the raw type — useful when you want to feed a number into a numeric prop:

```ts
{ component: 'Stack', props: { gap: '{{$.spacing}}' } }
// If $.spacing is 16, props.gap is the number 16, not the string "16".
```

### 3. Directives

Inside a value position (a prop value, a children string, etc.), you can use the `{$if, $then, $else}` directive object.

```ts
{
  component: 'Text',
  props: {
    color: { $if: '$.isError', $then: '#dc2626', $else: '#16a34a' },
  },
  children: 'Status',
}
```

Truthiness rules are the same as conditional nodes.

**Why both `if` (node) and `$if` (directive)?** Different layers. The node form swaps whole UI subtrees. The directive form picks a single value. The node form lives in the layout tree; the directive form lives in the value space.

### What's NOT a binding

- Numbers, booleans, nulls — pass through unchanged
- Plain strings without `$` or `{{}}` — pass through unchanged
- Objects without `$if` — walked recursively, each value resolved

---

## Two-way binding

Set `model: '<path>'` on a component to wire it for two-way data binding. The renderer resolves the path against the current scope chain (so loop variables work) and emits a `model: { ref, path }` field on the rendered node. The React adapter installs an event listener that writes back to the data store when the component dispatches a `ui:model` event.

```ts
{
  component: 'Input',
  model: '$.draftName',          // reads + writes data.draftName
  props: { placeholder: 'Your name' },
}
```

The `Input` component built into `@niscorp/nova/react/components` already dispatches `ui:model` on change, so this just works. To wire your own component, see `REACT_DOCS.md`.

### Loop case

`model: '$item.value'` inside a loop binds each iteration to its respective item's `value` field. The renderer materializes the absolute data path per iteration so each input writes to the right place.

```ts
{
  for: '$.items',
  as: 'item',
  do: { component: 'Input', model: '$item.value' },
}
```

Type into the second input → `data.items[1].value` updates → re-render shows the new value.

---

## Render context

`renderLayout(layout, data, ctx)` takes a context object:

```ts
{
  store: LayoutStore,            // for resolving LayoutRefs
  registry: ComponentRegistry,   // to validate component names
  strict: boolean,               // throw on errors vs return error nodes (default false)
  onError: (error: NovaError) => void,  // telemetry for non-strict errors
}
```

When `strict: false` (the default), errors during rendering are caught at each subtree boundary, surfaced via `onError`, and replaced with an error `RenderNode`. Sibling subtrees keep rendering. When `strict: true`, errors propagate.

### Errors the renderer can produce

- **`ComponentNotFoundError`** — `node.component` isn't registered.
- **`LayoutRefNotFoundError`** — `node.ref` isn't in the layout store.
- **`RenderError`** — anything else thrown during render (binding resolution, etc.).

All extend `NovaError` (see `DESIGN.md`).

---

## RenderNode output

The renderer emits `RenderNode[]` — a discriminated union:

```ts
type RenderNode =
  | { type: 'text'; value: string }
  | { type: 'fragment'; children: RenderNode[] }
  | {
      type: 'component';
      name: string;
      props: Record<string, unknown>;
      children: RenderNode[];
      ref?: string;
      model?: { ref: string; path: string };
    }
  | { type: 'error'; code: string; message: string; nodeRef?: string };
```

This is the contract between the renderer and any framework adapter. The React adapter walks this tree and instantiates the registered React components. A future Vue adapter would do the same with Vue components.

---

## Components

A component is anything you put in the registry. The renderer doesn't know what they look like — that's the framework adapter's job. From the layout's perspective, a component is just a name + a props schema (optional).

### Registering a component

```ts
const registry = createComponentRegistry();

// Bare registration:
registry.register('MyButton', myButtonComponent);

// With meta (description + Zod props schema for introspection):
registry.register('MyButton', myButtonComponent, {
  description: 'A clickable button.',
  propsSchema: ButtonPropsSchema,
});

// Bulk registration:
registry.registerAll({
  Stack,
  Text,
  Input,
  Button,
  Box,
});
```

### `registerAll` and static meta

If a component carries a static `.meta` property, `registerAll` picks it up automatically. Explicit meta in the call overrides static. See `REACT_DOCS.md` for the React-specific component shape.

### The default component set

`@niscorp/nova/react/components` ships seven headless React components:

- **`Stack`** — flex container with `direction`, `gap`, `align`, `justify`, `padding`, `wrap`
- **`Text`** — typography element with `as`, `size`, `weight`, `color`
- **`Input`** — text input bound via `model`
- **`Button`** — clickable button that dispatches `ui:click` with its `ref`
- **`Box`** — generic styling container
- **`CanvasSlot`** / **`ActionSlot`** — shell-aware slots used inside shell/canvas layouts; only usable under a `<NovaShellProvider>` (see `REACT_DOCS.md`)

Use `registerNovaReactComponents(registry)` to install all seven at once.

---

## Layout store

A simple keyed store for reusable layouts.

```ts
const store = createLayoutStore();

store.set('user-card', { component: 'Box', children: [...] });
store.get('user-card');                  // → the stored layout, or undefined
store.has('user-card');                  // → boolean
store.list();                            // → array of stored ids
```

`set` validates the layout against `LayoutNodeSchema` and throws `DefinitionValidationError` if it doesn't parse. So you can't accidentally store an invalid layout.

---

## Errors

Layout-time errors all extend `NovaError`:

- **`ComponentNotFoundError`** — `{name: string}` context
- **`LayoutRefNotFoundError`** — `{ref: string}` context
- **`RenderError`** — generic wrapper for thrown exceptions during render
- **`DefinitionValidationError`** — when `layoutStore.set` rejects an invalid layout

In **strict mode** (`strict: true` on the render context) these throw. In **lax mode** (the default) the renderer catches them at each subtree boundary and emits a `{type: 'error', code, message, nodeRef?}` RenderNode in place of the broken subtree, then continues. Sibling subtrees are unaffected.

---

## Quick reference

```ts
// Component
{ component: string, props?: object, children?: LayoutNode | LayoutNode[], ref?: string, model?: string }

// Conditional (node form)
{ if: Resolvable, then: LayoutNode, else?: LayoutNode }

// Loop
{ for: Resolvable, as: string, key?: string, do: LayoutNode }

// LayoutRef
{ ref: string }

// Slot (inside an ActionFragment's layout)
{ slot: string }

// Primitive
'string' | 123 | true | false | null

// Array (fragment)
[LayoutNode, LayoutNode, ...]

// Conditional (directive form, used in value positions)
{ $if: Resolvable, $then: any, $else?: any }
```

For actions that drive data into the layout, see `ACTION_DOCS.md`. For wiring layouts into a React app, see `REACT_DOCS.md`.
