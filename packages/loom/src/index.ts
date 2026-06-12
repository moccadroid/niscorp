// @niscorp/loom — schema-driven editors that run on Nova.
//
// Point Loom at a Nisc schema (Zod) and it produces a UI that can view,
// create, and edit data conforming to it. Two stages, two responsibilities:
//   parse  — schema → Loom's field model (IR). The model; no Nova.
//   toNova — model → a Nova editor (action + the layouts it references).
// `parse` is what Loom edits; `toNova` is how it renders. The React surface
// that mounts the result lives at `@niscorp/loom/react`.
//
// See DESIGN.md for the architecture.

export { parse } from './compile/parse.js';
export { toNova, ERROR_NAMESPACE, type NovaEditor } from './compile/to-nova.js';
export { attachValidation } from './validate.js';
export {
  createLoomEditor,
  mountView,
  type LoomEditor,
  type LoomEditorConfig,
  type LoomPlugin,
  type LoomArtifact,
  type LoomEvent,
  type WidgetBinding,
  type Document,
  type DocumentLayout,
} from './editor/editor.js';
export { Roles } from './compile/roles.js';
export type { Role } from './compile/roles.js';
export type {
  CompileOptions,
  EmptyValue,
  Field,
  FieldKind,
  FieldMeta,
  EnumOption,
  ObjectField,
  Pattern,
  Variant,
} from './compile/types.js';
