// @niscorp/loom/react — React surface for Loom editors.
//
// <LoomEditor> is the editing surface (a Nova shell of plugin-contributed
// canvases). The kit is the default widget components (one per compiler role)
// plus createLoomRegistry. Hooks (useLoomDocument, useModelWrite) are what plugin
// widgets build on.

export { LoomEditor, type LoomEditorProps, type LoomEditorPlugin } from './editor/loom-editor.js';
export { defaultPlugins } from './editor/defaults.js';
export { useLoomDocument, type LoomDocument } from './hooks/document.js';
export { useModelWrite } from './hooks/model.js';
export type { FieldContext } from '@compile/types';
export {
  createLoomRegistry,
  loomComponents,
  LoomGroup,
  LoomField,
  LoomBox,
  LoomColumn,
  LoomArray,
  LoomArrayItem,
  LoomVariant,
  LoomBranch,
  LoomAppend,
  LoomRowMenu,
  LoomText,
  LoomNumber,
  LoomCheckbox,
  LoomSelect,
  LoomRaw,
  JsonEditor,
} from './kit/index.js';
