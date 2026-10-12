import type { ActionDefinition } from '@niscorp/nova';
import type { LoomEditor } from './types.js';

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
