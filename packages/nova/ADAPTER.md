# Nova adapter contract

Nova's core is framework-free. It renders layout trees into `RenderNode[]`
and owns all state, events, and subscriptions. An adapter binds that to a UI
framework. Adapters live under `src/adapters/`, one folder per framework with
its own export subpath. Five reference implementations ship: the React
adapter (`@niscorp/nova/adapters/react`), the Vue adapter
(`@niscorp/nova/adapters/vue` — Vue 3 render functions in plain TS, no SFC
compiler; provide/inject for the render context, composables bridging the
shell subscriptions into shallowRefs, children handed to a component as its
default slot, the same primitive kit at `/adapters/vue/components` over the
SAME props schemas as React's), the plain-DOM adapter
(`@niscorp/nova/adapters/dom`, `createDomView` — no framework at all), the
line-terminal adapter (`@niscorp/nova/adapters/tty`, `createTtyView` — a
pure render to `{ text, interactives }`; the host maps commands onto the
numbered interactives), and the full-screen terminal kit
(`@niscorp/nova/adapters/ink` — an Ink component vocabulary riding the React
adapter's walker; Tab cycles focus, Enter activates). A Svelte adapter
would be a sibling folder, built the same way.

A react-shaped host that is not the DOM threads three optional seams through
`NovaRenderProvider`: `fallback` (unregistered names render their children
instead of an error marker), `textWrapper` (ink forbids bare strings outside
`<Text>`; the DOM renders them raw), and `errorMarker` (the default is a
`<span>`, which crashes a non-DOM renderer). Browser consumers omit all
three. A `ref`'d node rendered by a permissive fallback must still be
actionable — the TTY walker marks refs universally, so a kit-level fallback
(ink's) carries the focus + click convention itself.

An adapter imports only from `@niscorp/nova`'s public surface (plus its own
framework). Core never imports from an adapter.

## Obligations

An adapter must provide six things.

### 1. A RenderNode walker

Map `RenderNode[]` to framework elements:

- `text` → a text node.
- `fragment` → its children, keyless grouping.
- `error` → a visible marker carrying `code` and `message` (the React
  adapter renders a `<span data-nova-error>`; match that convention).
- `component` → look the name up in the registry; unknown names render an
  error marker with code `COMPONENT_NOT_FOUND`, never throw.

Inject framework props from the node using the core constants:
`node.model` → `NOVA_MODEL_PROP` (`{ ref, path }`), `node.ref` →
`NOVA_REF_PROP` (string). Spread `node.props` on top.

List identity comes from core's `renderNodeKey(node, index)`. Do not invent
key rules.

### 2. Dependency injection for registry, dispatch, publish

Rendered components never touch the shell. The adapter provides a component
registry, a `dispatch(event)` function, and a `publish(channel, payload)`
function through the framework's DI (React context, Vue provide/inject).
Without a shell, dispatch and publish are no-ops so static layouts render
with no event infrastructure.

### 3. Subscription bindings

Bridge core subscriptions into the framework's reactivity:

- `shell.onStateChange(handler)` — whole-shell snapshots.
- `shell.onCanvasChange(canvasId, handler)` — one canvas; the shell owns
  the equality check and only fires on meaningful change.
- `runtime.onDataChange(handler)` / `runtime.onStatusChange(handler)` — one
  action instance (via `shell.getRuntime(instanceId)`).

Trees come from `shell.getShellRenderTree()`, `shell.getCanvasRenderTree(id)`,
and `runtime.render()`. Recompute on the matching subscription, not on a
timer or a broader signal.

A remote renderer (a moss terminal) has no shell to subscribe to; it is
handed core's `RenderApi` instead — `frame()`, `canvasTree(canvasId)`,
`dispatch(canvasId, event)`, `publish(channel, payload?)` — and re-renders
when its host says so. The DOM adapter's `createDomView` consumes exactly
this shape.

A LOCAL shell is read as that same shape by core's `shellView(shell)` —
`{ api, subscribe }`: the shell's own trees as they stand, its own dispatch
(an event that names no origin goes to the canvas's active instance), and one
coalesced call per burst of changes. So an adapter written against `RenderApi`
draws a shell beside it with no second code path — the DOM adapter's
`mountShell(root, registry, shell)` is `createDomView` over a `shellView` —
and an empty canvas is `[]` either way (`canvasTreeOf`).

**Drawing to a string.** An adapter that can draw where there is no browser
lets a shell arrive as markup: React and Vue through their own server
renderers, the DOM adapter through `renderToString(registry, api, { window })`
(`@niscorp/nova/adapters/dom/server` — the host hands in a DOM; nova depends
on none). Await `shellSettled(shell)` first: an instance is `initializing`
until its mount hook has been awaited, so that is the moment the first screen
is whole. Adapters that adopt in place (React, Vue) hydrate over the markup; the
DOM adapter's first render replaces it with the same elements in one step, and
keeps those from then on (see "The DOM adapter keeps what did not change").

### 4. Structural slots and the component vocabulary

Register two structural components under the core names `CANVAS_SLOT_NAME`
and `ACTION_SLOT_NAME` — the shell's default layouts reference them:

- **CanvasSlot** (`{ canvasId }`): renders that canvas's tree; nothing when
  `canvasId` is missing.
- **ActionSlot** (`{ instanceId }`): renders that instance's tree; nothing
  when `instanceId` is missing. Wrap the dispatch handed to the instance's
  subtree with core's `scopeDispatch(dispatch, instanceId)` so its UI events
  reach its own triggers only. Do not reimplement the stamping rule.

`flattenRenderTree` resolves `CanvasSlot` markers away, but the `ActionSlot`
marker *survives* flattening: it arrives as a component node with
`props: { instanceId, canvasId, definitionId }`, `key: instanceId`, and the
instance's rendered tree as children. An adapter rendering flattened (served)
trees must key by instance so a swap remounts, and may read the identity
props (a slot wrapper's seam).

The registered ActionSlot's `propsSchema` stays the *authoring* contract —
`instanceId` only. The flatten-stamped identity props are runtime output,
never authored, so they don't belong in the schema (the layout agent's
palette reads it as "props you may set"). Do not validate served trees
against registry schemas — that checks output against an authoring contract.

Ship the primitive vocabulary — Stack, Text, Input, Button, Box at minimum,
plus the introspection primitives Panel and JsonTree (nova's devtools compose
against them) — with static `meta` (description + props schema) so registries
and agent tooling can introspect them. The React and Vue kits ship exactly
that set plus the two slots (`registerNovaReactComponents`,
`registerNovaVueComponents`). The DOM kit additionally ships Row, Grid,
Checkbox, Textarea, and Table, with Select and Switch as aliases of Input and
Checkbox; the TTY and Ink kits ship the DOM kit's names plus Badge (each a
`defaultRegistry()`).

### 5. SlotWrapper persistence

If the adapter supports an app-supplied slot wrapper (animation, gating,
logging at the ActionSlot seam), the wrapper renders *persistently* — with
content or with none — so a presence-managing wrapper can animate an
instance leaving. The adapter hands the wrapper identity only (`canvasId`,
`instanceId`, the `ActionDefinition`), never live state; identity fields are
undefined while the slot is empty or exiting. Nova owns no timing.

### 6. Remote round-trip obligations

The shell may be authoritative over a socket (moss serves canvas trees down,
`NovaEvent`s up), so a bound input's echo is *asynchronous* — the tree carrying
the value you just typed arrives a round trip later. Two behaviours that a local
shell gets for free (its echo is synchronous) an adapter must implement itself,
or bound inputs drop keystrokes the moment the shell is remote:

- **Preserve the in-progress value of a focused input.** While a `model`-bound
  input is focused, its local editing value is authoritative; an incoming tree
  must not overwrite it. Release to the server value on blur. The React, Vue
  and Ink `Input`s hold a local `draft` (`null` = not editing, server wins); the DOM adapter
  does not build a field again for a change of its `value` alone while it is
  being typed in, and shows the tree's value again at the first render after it
  is left. Same rule, framework-shaped mechanism.
- **Honour the `debounce` prop on a `model`-bound node.** `props.debounce`
  (milliseconds, default 0) coalesces `ui:model` dispatches; flush any pending
  value on blur. The React, Vue, DOM and Ink adapters implement it — omitting it silently
  makes a served `debounce` a no-op in your terminal, so the same layout behaves
  differently across renderers.

These belong to *every* adapter because they are artifacts of the transport, not
of taste — unlike styling, hover, or animation, which *should* differ per kit.
The line is exactly that: an adapter shares nova's treatment of the round trip
and nothing about how pixels look.

A line renderer discharges both trivially: the TTY adapter has no focused
input (a `set <n> <text>` command is one atomic, complete value, so there is
no in-progress draft for an echo to clobber) and therefore nothing for
`debounce` to coalesce. The obligations bind any adapter that *does* hold
live input focus — a full-screen TUI included.

## The DOM adapter keeps what did not change

React and Vue hand nova's trees to a reconciler. The DOM adapter has none to hand
them to, so it is one: `createDomView` keeps the tree it last drew beside the DOM
that tree produced, and a render walks the two together. What is the same as
last time keeps its element — **the same DOM node, never taken off the page** —
and only what differs is built.

That is the difference between a page that is drawn and a page that is drawn
*again*. An element that stays keeps everything the tree does not hold: focus,
scroll position, a text selection, an open `<details>`, a CSS animation in
flight, a playing `<video>`, a timer or an observer its component started. And
the cost of a change is the size of the change, not the size of the page: one
changed string is one text node written.

### What a render does

- **The same node keeps its element.** A component whose props, `ref`, `model`
  and children are what they were is not asked for an element again.
- **A text that changed is written** into the text node already there.
- **Siblings are matched by `renderNodeKey`**, as obligation 1 says. Two that
  share a key (looped rows that share a `ref` and carry no key) are told apart
  by order. A list that is reordered has its elements moved — as few as will do
  — not built; one that gains or loses an item gains or loses that one element.
- **A component whose own props, `ref` or `model` changed is asked again.** What
  is below it was reconciled all the same and is handed in, so a descendant
  that did not change is the same node under the new element. It was *moved*,
  though, and a move is not free: the browser restarts a moved element's
  animations and drops its scroll.
- **A different instance or canvas in the same place is all new.** An
  `ActionSlot` whose `instanceId` changed, or a `CanvasSlot` whose `canvasId`
  did, keeps nothing — with or without a key (obligation 4's "a swap remounts").
  Its listeners dispatch as the old instance; kept, a press would reach an
  instance that is no longer there.
- **A change in one instance or on one canvas leaves the others alone.** That
  follows from the rest and is the point of it.
- **The first render replaces whatever the root held**, once: markup drawn ahead
  of time is replaced with the same elements. Somebody already typing in that
  markup keeps their words, their caret and their focus — the adapter finds the
  field's twin by where it sits. Adopting the elements themselves, rather than
  replacing them, is not done.

### What a kit can rely on, and what it owes

A `DomComponent` is still a builder: props and already-built children in, one
element out, no update path. What changed is *when it is called* — only when it
has to be. It is not called because something else on the page changed, so:

**It is a function of its props and its children, and of nothing else.** A
component that reads the clock or the window while it builds keeps what it read
until its own props change. Something that has to move on its own — a countdown
— moves itself (a timer), and stops through `onRemove`.

**`onRemove(cleanup)`** is the other end of anything a component starts. The
cleanup runs once, when the element leaves the page for good: it was removed, it
was replaced because its own props changed, or the view was destroyed
(`renderToString` destroys the view it drew with, so nothing is left running
where only markup was wanted). An element that stays is not told anything.

**Children are patched in place only under an element that holds exactly them.**
The adapter looks at what the component returned:

| The component… | When its children change |
| --- | --- |
| put them, in order and with nothing else, straight into the element it returned | they are put in, taken out and moved under that element; the component is not asked |
| did anything else with them — an inner wrapper, a cell around each, a heading of its own before them, read them and placed none | it is asked again whenever it would be handed different children. A change *inside* a child is still patched where it stands |
| goes from having children to having none, or back | it is asked again, whichever of the above it is — it may draw itself differently when empty |

The middle row is not a penalty for being unusual; it is the only safe answer.
A kit that wraps each child in a cell looks, with a single child, exactly like
one that wraps them all in one box, and the adapter cannot ask what it would do
with a second. So: **for a list whose items come and go — a thread, a feed, a
set of cards — put the children straight into the element that holds them** (and
that scrolls, if it scrolls). A wrapper inside it means every arrival moves
every item.

**A component that depends on its children says so.** One that holds its
children *and* marks them, counts them, or treats the first unlike the rest
looks like one that only holds them — and a child patched in beside the others
would go unmarked. It calls `dependsOnChildren()` while it builds, and is then
asked again whenever it would be handed different children. It is handed the
children that stayed as it left them, so what it does to them it must be able
to do twice: set a mark *and* clear it, not only set it.

**What changes often goes in as children, not as a prop.** A component fed by a
prop is built again when that prop changes — a new element, without the scroll
or the animation of the old one. The same text handed in as a child is a text
node written in place, under an element that stays:

```ts
{ component: 'Code', props: { text: '$.source' } }   // a new <pre> on every change
{ component: 'Code', children: '$.source' }          // the same <pre>, its text written
```

This is where the DOM adapter is still a step behind React and Vue, which run
the component again and keep the element. An `update` path on a component would
close it; nothing has needed one yet.

### Bound fields and focus

- **A field that is being typed in is not replaced for its `value`.** A tree
  that differs from the last only in a bound field's `value` — the echo of what
  was just typed, or a value from elsewhere — leaves the field alone while the
  person is in it: its caret, an IME composition and a pending debounce are the
  element's, and stay with it. Once it is left, the next render shows the tree's
  value again (the kit is asked for the field afresh, because how a value is
  shown is the kit's business). A checkbox or a radio is not "typed in": the
  tree's answer shows at once.
- **A field that had to be built again while focused** (another of its props
  changed) is given what was being typed, the caret, and focus.
- **Focus follows the element.** One that stayed has it still. One that was
  moved has it given back; one that was built again has it given to the element
  built in its place — a button as much as a field.
- **Leaving a field sends what debounce was holding**, as obligation 6 says.

### What it costs

Keeping a tree beside the DOM is not free, and the cases where it costs more
than it saves are the ones in which nothing could be kept. Measured in Chrome
154 (2026-10-03) on a list of 2,000 rows, each change drawn and laid out,
against the adapter that drew everything again:

| | drawn again | patched |
| --- | --- | --- |
| one row's text changes | 5.0 ms | 0.9 ms |
| one row is added, or moved | 5.1 ms | 1.4 ms |
| every row's text changes | 7.2 ms | 4.9 ms |
| the first draw | 5.6 ms | 6.3 ms |
| the whole list reversed | 5.1 ms | 5.6 ms |
| every row's own props change | 5.3 ms | 6.7 ms |
| every row replaced by a new one | 5.2 ms | 6.8 ms |

So: a first draw costs about a tenth more, and a render that replaces
everything about a third more. Any render that keeps something costs less, and
the usual one — a little changed on a large page — a small fraction. What the
view holds does not grow with use: after 24,000 renders that each replaced a
whole list it held what it held after 3,000.

### How it is held to that

`test/adapters/dom-retained.test.ts` asserts identity (`toBe`) and "never taken
off the page" (a `MutationObserver` over the root — an element removed and put
straight back is the same node and has still lost its scroll).
`test/adapters/dom-differential.test.ts` draws long runs of random trees and
holds the patched page, after every one, to a page drawn from nothing: the same
markup, the same dispatch from every press, and no write at all when the same
tree is drawn twice. Its kit has one component for each way of treating
children named above. A change to the adapter that lets a patched page drift
from a drawn one fails there, by seed.
