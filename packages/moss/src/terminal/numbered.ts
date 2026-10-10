import { scopeDispatch } from '@niscorp/nova';
import type { NovaEvent } from '@niscorp/nova';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import type { TerminalApi } from './index';

// ═══════════════════════════════════════════════════════════════
// Numbered addressing: nova's TTY adapter numbers everything on a screen that
// can be acted on, and prints `[n]` beside it. The REPL (./tty) reads a typed
// line and the full-screen target (./ink) a typed digit; what the interactive a
// number names is then sent is the same for both, and is said here once. So
// `[7]` does the same thing in the REPL and the TUI.
// ═══════════════════════════════════════════════════════════════

// What a tap on an interactive sends: a toggle flips, a button or a row clicks
// with its value. An input has none — a tap focuses it, and how a target
// focuses is its own.
export const tapEventOf = (interactive: TtyInteractive): NovaEvent | undefined => {
  if (interactive.kind === 'model') return undefined;
  if (interactive.kind === 'toggle') return { type: 'ui:model', ref: interactive.ref, payload: interactive.value !== true };
  return interactive.value === undefined ? { type: 'ui:click', ref: interactive.ref } : { type: 'ui:click', ref: interactive.ref, payload: interactive.value };
};

// Dispatch for a numbered interactive. The canvas and the instance were
// recorded at render time; the instance is the event's origin, because a list
// canvas has several live at once. Frame chrome (canvas '') dispatches
// nothing, same as every other target: false.
export const sendFrom = (api: TerminalApi, interactive: TtyInteractive, event: NovaEvent): boolean => {
  if (interactive.canvas === '') return false;
  const dispatch = (stamped: NovaEvent): void => api.dispatch(interactive.canvas, stamped);
  (interactive.origin === undefined ? dispatch : scopeDispatch(dispatch, interactive.origin))(event);
  return true;
};
