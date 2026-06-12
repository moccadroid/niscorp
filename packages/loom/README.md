# @niscorp/loom

Loom builds editing UIs from schemas. Give it a [Zod](https://zod.dev) schema
and it produces a form that views, creates, and edits JSON matching that schema.
The form is built from the schema's structure — nested objects become nested
sections, arrays get add and remove controls, unions become a type picker plus
the fields for the chosen type — so editing the form always produces valid data.
There is no hand-written form code and no raw text box.

The forms render on [Nova](../nova), this stack's layout engine. Loom compiles a
schema into a Nova layout; Nova draws it and routes each edit back into the data.

## Install

```bash
pnpm add @niscorp/loom @niscorp/nova zod
```

`@niscorp/nova` is required. The React surface (`@niscorp/loom/react`) also needs
`react`. Domain plugins each need their own library — `@niscorp/vex` for the Vex
plugin, `@niscorp/prism` for the Prism plugin. All three are optional: a consumer
that only uses the compiler installs none of them.

## Two ways to use Loom

### The compiler — turn a schema into a Nova editor

`parse` reads a schema into a field model. `toNova` turns that model into a Nova
editor: an action that holds the data being edited, plus the layouts that render
it.

```ts
import { parse, toNova } from '@niscorp/loom';
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number().int(),
  tags: z.array(z.string()),
});

const { action, layouts } = toNova(parse(schema));
// `action.data` is the document being edited; hand `action` and `layouts`
// to a Nova runtime to render the form. Every edit writes `action.data`
// in place, and the data stays valid against `schema`.
```

This half is headless — no React, no DOM. Use it when you have your own Nova host
or only need the compiled output.

### The editor — a ready-made React surface

`<LoomEditor>` is the integrated surface. It loads a set of plugins, compiles
each plugin's schemas into forms, and renders everything as one Nova shell: the
forms on the left, a live preview and JSON panes alongside.

```tsx
import { LoomEditor, defaultPlugins } from '@niscorp/loom/react';
import { prism } from '@niscorp/loom/plugins/prism/react';

<LoomEditor
  plugins={[...defaultPlugins(), prism({ input })]}
  artifact={{ type: 'prism', documents: { config } }}
  onChange={(documents) => console.log(documents)}
/>;
```

- `plugins` is the loaded set. They load in order, and a later plugin can
  override or remove an earlier one. `defaultPlugins()` adds the Data and
  Validations JSON panes — spread it **first** so domain plugins load after it.
- `artifact` says what to edit. `type` names the plugin that handles it;
  `documents` seeds the starting values (omit it to start from the schema's
  defaults).
- `onChange` fires with the live document values on every edit.
- To switch to a different artifact, give the element a new React `key`.

A **plugin** wires one domain into the editor. It contributes the schemas to edit
(its *documents*), optional custom field widgets, and usually a preview. The two
reference plugins:

- `prism({ input })` — edit a [Prism](../prism) transform config; the preview
  applies it to `input` and shows the output.
- `vex({ run, db })` — edit a [Vex](../vex) query; the preview runs it with `run`
  and shows the rows. Pass `db` to get column-aware field pickers.

## Entry points

| Import | What it gives you |
|---|---|
| `@niscorp/loom` | The compiler (`parse`, `toNova`), the editor controller (`createLoomEditor`), and the types. Headless. |
| `@niscorp/loom/react` | `<LoomEditor>`, `defaultPlugins()`, and the widget kit. |
| `@niscorp/loom/plugins/{vex,nova,prism}` | A domain plugin's framework-free core. |
| `@niscorp/loom/plugins/{vex,nova,prism}/react` | A domain plugin's React surface (preview and widget components). |

## Documentation

- [DESIGN.md](./DESIGN.md) — how Loom is built and why. Read it before the source.

## License

MIT
