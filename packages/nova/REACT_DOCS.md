# React Adapter — Author Guide

How to use nova in a React app. The React adapter is a separate subpath: `@niscorp/nova/react`. The core (`@niscorp/nova`) is framework-agnostic and never imports React. The adapter is the glue that turns nova's `RenderNode[]` output into actual React elements.

This guide is for **using** nova in React. For nova's framework-agnostic core, see `LAYOUT_DOCS.md`, `ACTION_DOCS.md`, and `SHELL_DOCS.md`.

---

## Install

```bash
pnpm add @niscorp/nova
# React + react-dom are peer deps; you almost certainly already have them.
```

`@niscorp/nova/react` is the same package, accessed via the subpath export. No separate install.

---

## A first React app

```tsx
import { createShell, createComponentRegistry, createLayoutStore } from '@niscorp/nova';
import { NovaShellProvider, useCanvas, useRenderTree, RenderTree } from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';
import { useEffect, useState } from 'react';

const counter = {
  id: 'counter',
  data: { count: 0 },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Count: {{$.count}}' },
      { component: 'Button', ref: 'inc', children: 'Increment' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'inc', do: [{ increment: 'count' }] },
  ],
};

const App = () => {
  const [shell] = useState(() => {
    const registry = createComponentRegistry();
    registerNovaReactComponents(registry);
    const layoutStore = createLayoutStore();
    return {
      shell: createShell({
        canvases: ['main'],
        registry,
        layoutStore,
        actions: { counter },
      }),
      registry,
    };
  });

  useEffect(() => {
    shell.shell.push('main', 'counter');
    return () => shell.shell.dispose();
  }, [shell]);

  return (
    <NovaShellProvider shell={shell.shell} registry={shell.registry}>
      <CanvasView canvasId="main" />
    </NovaShellProvider>
  );
};

const CanvasView = ({ canvasId }: { canvasId: string }) => {
  const canvas = useCanvas(canvasId);
  const tree = useRenderTree(canvas.active?.id ?? '');
  return <RenderTree nodes={tree} />;
};
```

This is a complete working React + nova counter. Click the button, the count goes up, the text re-renders.

---

## The two providers

The React adapter has **two providers** because there are two ways to use nova in a React app:

### `<NovaShellProvider>` — full shell mode

Use this when you have a `Shell`. The provider wires the shell's dispatch/publish into the render context so components can emit events back to the shell. Most apps use this.

```tsx
<NovaShellProvider shell={shell} registry={registry}>
  <CanvasView canvasId="main" />
</NovaShellProvider>
```

Props:
- **`shell`** — a `Shell` instance
- **`registry`** — the component registry. Same instance you passed to `createShell`.
- **`children`** — the React subtree that uses nova hooks.

### `<NovaRenderProvider>` — render-only mode

Use this when you want to render a layout without a shell — for previews, tests, or the showroom. You supply the dispatch and publish functions yourself (or pass no-ops).

```tsx
<NovaRenderProvider
  registry={registry}
  dispatch={(event) => console.log('dispatch:', event)}
  publish={(channel, payload) => console.log('publish:', channel, payload)}
>
  <RenderTree nodes={someStaticRenderTree} />
</NovaRenderProvider>
```

Props:
- **`registry`** — the component registry
- **`dispatch`** — function to receive events from components
- **`publish`** — function to receive message bus publishes from components
- **`children`** — the React subtree

This is what the showroom uses for layout-only stories that don't need a shell.

---

## Hooks

All hooks must be called inside one of the providers above.

### `useShell()`

Returns the active `Shell`. Throws if called outside a `<NovaShellProvider>`.

```tsx
const shell = useShell();
shell.dispatch({ type: 'ui:click', ref: 'manual' });
```

### `useShellState()`

Returns the current `StateSnapshot`. Re-renders the calling component whenever any canvas changes. Backed by `useSyncExternalStore` so it's tearing-safe under React concurrent rendering.

```tsx
const state = useShellState();
const mainStack = state.canvases.main?.stack ?? [];
```

### `useCanvas(canvasId)`

Returns the `CanvasState` for one canvas. Re-renders only when this specific canvas's stack or active instance changes.

```tsx
const canvas = useCanvas('main');
const activeId = canvas.active?.id;
```

### `useActionData(instanceId)`

Returns the live data for an action instance. Re-renders whenever that instance's data changes. Returns `undefined` if the instance doesn't exist.

```tsx
const data = useActionData(activeId);
```

### `useActionStatus(instanceId)`

Returns the action's status (`'initializing' | 'active' | 'suspended' | 'unmounted'`).

```tsx
const status = useActionStatus(activeId);
if (status === 'initializing') return <Spinner />;
```

### `useRenderTree(instanceId)`

Returns the live `RenderNode[]` for an action instance. Re-computes whenever the instance's data changes. **The result is referentially stable** when the data hasn't changed — important for React's `useSyncExternalStore` and for downstream memoization.

```tsx
const tree = useRenderTree(activeId);
return <RenderTree nodes={tree} />;
```

### `useNovaDispatch()` / `useNovaPublish()`

Inside a registered component, call these to send events back to the shell. They read from the render context, not the shell context, so they work in both `NovaShellProvider` and `NovaRenderProvider` modes.

```tsx
const Button: NovaComponent<{ label?: string }> = ({ label, novaRef, children }) => {
  const dispatch = useNovaDispatch();
  return (
    <button onClick={() => novaRef && dispatch({ type: 'ui:click', ref: novaRef })}>
      {label ?? children}
    </button>
  );
};
```

### `useNovaRegistry()`

Returns the active component registry. Useful for components that need to look up other components by name.

---

## `<RenderTree>` and component instantiation

`<RenderTree nodes={...} />` walks a `RenderNode[]` array and renders each node. It dispatches:

- `text` nodes → render their `value` as text
- `fragment` nodes → recurse into children
- `error` nodes → render via `<ErrorMarker>`
- `component` nodes → look up the component in the registry and instantiate it

```tsx
const tree = useRenderTree(activeId);
return <RenderTree nodes={tree} />;
```

That's the entire React-side rendering pipeline. Everything else is the components themselves.

---

## Writing your own component

A component for the React adapter is a React function component typed as `NovaComponent<P>`:

```tsx
import type { NovaComponent } from '@niscorp/nova/react';
import { z } from 'zod';

const MyButtonPropsSchema = z.object({
  label: z.string().optional().describe('Button label.'),
  variant: z.enum(['primary', 'secondary']).optional().describe('Visual variant.'),
}).strict();

type MyButtonProps = z.infer<typeof MyButtonPropsSchema>;

export const MyButton: NovaComponent<MyButtonProps> = ({
  label,
  variant,
  novaRef,
  novaModel,
  children,
}) => {
  // Component implementation...
  return <button>{label ?? children}</button>;
};

// Static meta — picked up by registerAll() automatically.
MyButton.meta = {
  description: 'A clickable button.',
  propsSchema: MyButtonPropsSchema,
};
```

### Framework-injected props

The renderer adds these props to every component automatically (in addition to whatever `props` the layout supplied):

- **`children?: ReactNode`** — child slot
- **`novaRef?: string`** — the layout node's `ref` field, if set. Use this when dispatching events.
- **`novaModel?: { ref: string; path: string }`** — present when the layout used `model:` on this node. Indicates the component is two-way bound. Read it to know whether to dispatch `ui:model` events on change.

### Dispatching events

Components emit events back to the shell via `useNovaDispatch`:

```tsx
const dispatch = useNovaDispatch();

// On click
<button onClick={() => novaRef && dispatch({ type: 'ui:click', ref: novaRef })}>...</button>

// On input change (two-way binding)
<input
  value={value}
  onChange={(e) => {
    if (novaModel) {
      dispatch({ type: 'ui:model', ref: novaModel.ref, payload: e.target.value });
    }
  }}
/>
```

The shell routes these to triggers with matching `event:` and `ref:` fields. If your component is `model:`-bound, the runtime auto-installs a listener that converts `ui:model` events into `set` mutations on the bound path — no trigger needed.

### Registering

```ts
import { createComponentRegistry } from '@niscorp/nova';
import { MyButton } from './my-button';

const registry = createComponentRegistry();
registry.register('MyButton', MyButton);

// Or batch with the static meta picked up automatically:
registry.registerAll({ MyButton });
```

### The default component set

`@niscorp/nova/components/react` ships five components and a registration helper:

```ts
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

const registry = createComponentRegistry();
registerNovaReactComponents(registry);
// Now Stack, Text, Input, Button, Box are all registered.
```

You can mix the default set with your own:

```ts
const registry = createComponentRegistry();
registerNovaReactComponents(registry);
registry.register('MyButton', MyButton);
```

---

## Error handling

The renderer can produce error nodes when in lax mode (the default). The React adapter renders them via the `ErrorMarker` component:

```tsx
import { ErrorMarker } from '@niscorp/nova/react';
```

You don't usually need to use this directly — `<RenderTree>` handles error nodes internally. The output is a `<span data-nova-error="CODE">...</span>` element you can style with CSS.

For React-level errors (a buggy component throwing during render), use `<NovaErrorBoundary>`:

```tsx
import { NovaErrorBoundary } from '@niscorp/nova/react';

<NovaErrorBoundary fallback={<div>Something broke.</div>}>
  <CanvasView canvasId="main" />
</NovaErrorBoundary>
```

This is a real React class component (the only class in the package — React 18 still requires class boundaries).

---

## React 18+ compatibility

- **Strict mode** — fully supported. The hooks use `useSyncExternalStore` and the render-tree hook caches its snapshot via `useRef`, so dev-mode double-mounting doesn't break anything.
- **Concurrent rendering** — fully supported. `useSyncExternalStore` is tearing-safe by design.
- **Suspense** — not used as a loading model. Loading state is explicit data on the action (`{ loading: true }` as a regular field). A consumer can wrap nova components in `<Suspense>` but it never activates because nova never throws promises during render.
- **SSR** — not enabled yet. `useSyncExternalStore` requires a `getServerSnapshot` parameter for SSR; nova hooks don't currently provide one. Calling nova hooks during server rendering will throw.
- **React Server Components** — not tested. The hooks are client-only.

---

## Common patterns

### Render the active action of a canvas

```tsx
const ActiveCanvas = ({ canvasId }: { canvasId: string }) => {
  const canvas = useCanvas(canvasId);
  const tree = useRenderTree(canvas.active?.id ?? '');
  return <RenderTree nodes={tree} />;
};
```

### Render multiple canvases side by side

```tsx
const App = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <div style={{ display: 'flex' }}>
      <ActiveCanvas canvasId="nav" />
      <ActiveCanvas canvasId="content" />
    </div>
  </NovaShellProvider>
);
```

### Read live data alongside the canvas

```tsx
const Header = ({ canvasId }: { canvasId: string }) => {
  const canvas = useCanvas(canvasId);
  const data = useActionData(canvas.active?.id ?? '');
  return <h1>{data?.['title'] as string ?? 'Untitled'}</h1>;
};
```

### Push from outside nova (a router event, a websocket message, etc.)

```tsx
const SomeReactComponent = () => {
  const shell = useShell();
  return <button onClick={() => shell.push('main', 'login')}>Log in</button>;
};
```

---

## Quick reference

```tsx
// Providers
<NovaShellProvider shell registry>...</NovaShellProvider>
<NovaRenderProvider registry dispatch publish>...</NovaRenderProvider>

// Hooks
useShell()                    // → Shell (throws outside provider)
useShellState()               // → StateSnapshot (subscribes)
useCanvas(canvasId)           // → CanvasState (subscribes to canvas)
useActionData(instanceId)     // → data | undefined
useActionStatus(instanceId)   // → ActionStatus | undefined
useRenderTree(instanceId)     // → RenderNode[]
useNovaDispatch()             // → (event) => void
useNovaPublish()              // → (channel, payload?) => void
useNovaRegistry()             // → ComponentRegistry

// Render
<RenderTree nodes={...} />

// Errors
<ErrorMarker code message />
<NovaErrorBoundary fallback>...</NovaErrorBoundary>

// Component contract
type NovaComponent<P> = React.FC<NovaComponentProps & P> & { meta?: ComponentMeta };
type NovaComponentProps = {
  children?: ReactNode;
  novaRef?: string;
  novaModel?: { ref: string; path: string };
};
```

For the layout language registered components consume, see `LAYOUT_DOCS.md`. For the action machinery the shell drives, see `ACTION_DOCS.md` and `SHELL_DOCS.md`.
