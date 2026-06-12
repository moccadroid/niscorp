# Loom — Design

This document explains how Loom is built and why. For how to use it, see
[README.md](./README.md). For Nova itself, see [../nova](../nova); the few Nova
terms Loom depends on are defined here as they come up.

## What Loom is

Loom turns a schema into an editing UI. The input is a [Zod](https://zod.dev)
schema — every artifact in this stack is defined in Zod, so Loom takes Zod
directly. The output is a UI, built on Nova, that edits JSON conforming to that
schema. Point Loom at a different schema and you get a different editor; the
machinery is the same.

It has two parts that can be used separately:

- **The compiler** turns a schema into a Nova editor. This is the core.
- **The editor host** assembles compiled forms, previews, and panes into one
  integrated surface, loaded from plugins.

The compiler is the foundation; the host is built on top of it.

## The compiler

Compilation is two stages with a data structure between them.

```
Zod schema  ──parse──▶  Field model (IR)  ──toNova──▶  { action, layouts }
```

### Stage 1: parse — schema to field model

`parse` walks a Zod schema and normalizes it into a flat model of `Field` nodes
(the IR — intermediate representation). Zod has many ways to express the same
shape; `parse` collapses those into one tagged union so every later stage can
dispatch on a single `kind`. The kinds are: `string`, `number`, `boolean`,
`enum`, `object`, `array`, `tuple`, `union`, `self`, and `unknown`.

This model is pure data. It knows nothing about Nova. It is *what Loom edits*,
described independently of how it is rendered.

### Stage 2: toNova — field model to Nova editor

`toNova` turns the model into a Nova **editor**, which is two things:

- an **action** — Nova's unit of state plus layout. Its `data` is the document
  being edited.
- the **layouts** it references — Nova layouts are declarative trees of
  components. A simple schema needs only the one inside the action; a recursive
  schema also needs named templates (see [Recursion](#recursion)).

Each field becomes a control bound to a path in the document by a *binding
expression*: `$.name` at the root, `$item` inside an array loop. Binding is how
Nova connects a control to a slot in the data — when the control changes, Nova
writes that slot. So editing the form mutates the document in place, and because
the document was shaped from the schema, it stays valid.

`toNova` is the only part of Loom that speaks Nova. Everything Nova-specific
lives here.

### The field model is the seam

The model sits between the two stages on purpose. `parse` depends only on Zod;
`toNova` depends only on the model and Nova. Neither knows about the other. That
boundary is where alternatives attach without disturbing the rest: a second
front end (some other schema language producing a `Field`) would feed `toNova`
unchanged, and a second back end (rendering the model some other way) would
consume `parse` unchanged. Today there is one of each, but the split keeps that
door open and keeps each half small.

### Roles: the widget vocabulary

`toNova` does not emit concrete components. It emits **roles** — abstract names
like `loom:text`, `loom:select`, `loom:array`, `loom:variant`. A *kit* registers
a real component under each role. Swapping the kit re-skins every compiled
editor without touching the compiler.

The vocabulary is deliberately small and stable
([roles.ts](./src/compile/roles.ts)): layout primitives (`box`, `group`,
`array`, `array-item`, `variant`, `branch`), a field wrapper (`field` — label,
description, error, required marker), controls (`text`, `number`, `checkbox`,
`select`, `raw`), and list actions (`append`, `row-menu`). Structural shapes
(objects, arrays, unions) are *compositions* of these roles, not roles of their
own. New variations ride as props rather than new roles.

### Editing is model writes only

Every edit — including adding, removing, and reordering list items — is a write
to the bound data through Nova's standard binding pipeline. Loom emits no Nova
action triggers and no behavior-bearing buttons.

- `append` writes a default element onto the array it binds.
- `row-menu` (move, remove, and wrap/unwrap for recursive lists) reads `$items`
  — the whole array — and `$index`, and writes back the new array.

Both work at any nesting depth, because the bound path is resolved by Nova per
render rather than baked in at compile time. Keeping editing to data writes is
what lets the same compiled layout drive a list of any length and a tree of any
depth.

### Unions: discrimination happens in JS

A union (a value that can be one of several shapes) compiles to one chooser plus
the editors for each branch. Which branch is active is **not** encoded in the
layout. Instead, `parse` records a `Pattern` for each branch — the one fact that
recognizes it in a value:

- `tag` — a shared field equals a literal (`z.discriminatedUnion`).
- `key` — a field unique to this branch is present (a structural union).
- `type` — the value's own JS type is unique to this branch, e.g. a string or
  array among objects (a mixed union).
- `fallback` — the single catch-all branch, selected only when nothing else
  matches (e.g. an unconstrained object among tagged operations).

At render, the variant widget matches the current value against these patterns
in plain JS and shows the branch that fits; choosing a different branch writes
that branch's defaults into the document. Tagged, structural, and mixed unions
are one code path, and no union-specific concept leaks into Nova.

### Recursion

Several schemas in this stack are recursive — a Nova layout nests layouts, a
filter nests filters. A schema like that is infinitely deep, but a document is
not, so Loom follows the document, not the schema.

`parse` stops when it re-enters a type it is already inside and marks the
back-edge with a `self` node, yielding a finite model from an infinite schema.
`toNova` emits the recursive shape once as a named layout template authored
against `$item`; the `self` reference points back to that template, and Nova
resolves it per render against the live data. The form is therefore exactly as
deep as the document, and growing or shrinking it is an ordinary list write.

### Custom widgets

A plugin can replace a field's default control with its own — a Vex field-path
picker, a Prism node editor. A widget is a matcher plus a component: the matcher
(`{ role, match }`) tests a field by where it sits (its `kind` and dot-path
within its scope), the compiler applies the first match and emits that field
under the given role, and the kit supplies the component for that role. Matching
is structural and resolved at compile time. Because a recursive template
restarts the path, matchers target by suffix and stay depth-agnostic. The
component, and any data it needs, lives in the React layer — the compiler only
records which role a field uses.

### Validation

Loom validates with the same schema it compiled from — there is no second source
of truth. `attachValidation` runs the schema's `safeParse` (refinements and all)
over the live document and writes any problems into a reserved `_errors` slot in
the data; each field binds its own error slot, so messages show inline. The
`_errors` slot is stripped from the document Loom reports out.

## The editor host

`createLoomEditor` is the controller behind the integrated surface. Like the
compiler, it is framework-free.

It owns one Nova **shell** — Nova's container for multiple **canvases** (render
targets), each holding an action — built empty. Everything visible is
contributed by plugins. The flow:

- `loadPlugin(plugin)` registers a plugin and calls its `mount(editor)` hook,
  handing it the live editor. Through `mount` a plugin can add canvases, register
  actions, arrange the canvas layout, or load further plugins.
- `open(artifact)` selects the plugin named by `artifact.type` and compiles its
  documents into form canvases. The controller then publishes the live document
  values (`editor.documents`) and validation problems (`editor.validations`), and
  emits `change` / `open` events.

### Documents

A plugin declares one or more named **documents** — the things to edit. A
document is usually a Zod schema, which the controller compiles with `toNova`. It
can instead be a function `(value) => layout` for a freeform document that has no
fixed schema (the Nova plugin's `data`, whose shape depends on which bindings the
layout uses); the plugin builds the layout itself, and the controller still seeds
and tracks the value.

A schema whose root is not an object (a union, a scalar, a bare array) compiles
to a single control, which has no document root to bind to. The controller wraps
such a document under an internal key so its control has a real path, and unwraps
it before publishing — so the wrapping never reaches a plugin or a consumer.

### Plugins

A plugin's core descriptor is small:

```ts
type LoomPlugin = {
  name: string;
  documents: Record<string, Document>;   // schema (compiled) or freeform layout
  widgets?: WidgetBinding[];             // { role, match } — custom field widgets
  mount?: (editor: LoomEditor) => void;  // lifecycle hook over the live shell
};
```

The render components — previews, widget components, view panes — are not part
of this core. They live in the plugin's React surface and are registered with the
kit by role. A plugin therefore splits the same way the package does: a
framework-free core (`@niscorp/loom/plugins/vex`) and a React surface
(`@niscorp/loom/plugins/vex/react`) that adds the components.

The default Data and Validations JSON panes are themselves plugins. The host
holds no domain knowledge; it loads what it is given, in order, last load wins.

### The React surface

`<LoomEditor>` builds a component registry from the loaded plugins' components,
creates the controller against it, loads the plugins, opens the artifact, and
renders the shell with `<NovaShell>`. The controller produces the structure and
drives the shell; React only mounts it and supplies components. A Vue surface
later would be the same controller with a Vue kit.

## Locked decisions

These are settled, with the reason each is held.

1. **Built on Nova, deliberately.** The only intentionally non-Nova code is the
   thin React mount and the components a plugin registers. All structure — forms,
   panes, the canvas layout — is Nova. Loom is how we find where Nova needs to
   grow: when Nova cannot express something, the fix is to grow Nova or drop a
   plugin widget in at the marked seam, not to route around Nova.

2. **Zod is the only input.** Loom reads types, formats, optionality, and labels
   straight off the Zod schema, with no intermediate JSON Schema layer. The same
   schema is the validation truth. We do not add another input format until
   something concrete needs it.

3. **Headless core, framework surface.** `parse`, `toNova`, and
   `createLoomEditor` are Nova-only and produce data and a driven shell;
   `@niscorp/loom/react` mounts the result and supplies the kit. The same split
   applies to each plugin. This keeps the logic testable without a UI framework
   and leaves room for other surfaces.

4. **Editing is model writes only.** No action triggers, no behavior-bearing
   buttons; add, remove, and reorder are data writes through Nova's binding
   pipeline (see above). This is what makes arrays and recursion work uniformly
   at any depth.

5. **Unions and recursion are solved by reading the data, not the schema.** The
   document decides which union branch shows and how deep the form goes; the
   schema only says what is addable and what the options are.

## Kept open (not built)

- **AI plugin (Cortex).** An optional plugin: a Cortex agent whose output schema
  *is* the schema being edited (or a JSON-Patch over it), so it cannot emit an
  invalid artifact, proposing a reviewable diff. Everything is JSON and schemas,
  so it slots in later without reshaping the core.
- **Editable raw view.** A synced, editable raw-JSON view beside the visual
  editor. Today the JSON panes are read-only.
- **Loom Studio.** A layer above the single-artifact editor for working on many
  artifacts at once.
