import { scopeDispatch } from '@niscorp/nova';
import type { NovaEvent } from '@niscorp/nova';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import type { TerminalApi } from './index';

export const tapEventOf = (interactive: TtyInteractive): NovaEvent | undefined => {
  if (interactive.kind === 'model') return undefined;
  if (interactive.kind === 'toggle') return { type: 'ui:model', ref: interactive.ref, payload: interactive.value !== true };
  return interactive.value === undefined ? { type: 'ui:click', ref: interactive.ref } : { type: 'ui:click', ref: interactive.ref, payload: interactive.value };
};

export const sendFrom = (api: TerminalApi, interactive: TtyInteractive, event: NovaEvent): boolean => {
  // Canvas '' is frame chrome, which dispatches nothing.
  if (interactive.canvas === '') return false;
  const dispatch = (stamped: NovaEvent): void => api.dispatch(interactive.canvas, stamped);
  (interactive.origin === undefined ? dispatch : scopeDispatch(dispatch, interactive.origin))(event);
  return true;
};
