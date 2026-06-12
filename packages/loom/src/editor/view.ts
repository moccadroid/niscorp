import type { ActionDefinition } from '@niscorp/nova';
import type { LoomEditor } from './types.js';

// Mount a view canvas: register `action`, add a canvas that renders it, and keep
// its data in sync with the editor's live state — `read(editor)` is pushed onto
// the canvas on every `change`. The canvas id is the action id. Used by the
// default plugins (jsonviewer, validation) and any domain preview; the contributor
// owns the canvas, so a later plugin can `shell.removeCanvas(action.id)` to drop it.
export const mountView = (
  editor: LoomEditor,
  action: ActionDefinition,
  read: (editor: LoomEditor) => Record<string, unknown>,
): void => {
  const { shell } = editor;
  shell.registerAction(action);
  shell.addCanvas({ id: action.id, initial: action.id });
  const instance = shell.getCanvasState(action.id).active?.id;
  if (instance === undefined) return;
  const sync = (): void => {
    shell.getRuntime(instance)?.setData(read(editor));
  };
  editor.on('change', sync);
  sync();
};
