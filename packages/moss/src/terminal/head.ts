import { createHeadKeeper, headOf } from '@niscorp/nova/document';
import type { TerminalApi } from './index';

// ═══════════════════════════════════════════════════════════════
// The page's <head>, kept on the screen.
//
// A drawn page arrives with its head written (../document). From then on the
// screen moves over the wire and the page is never fetched again, so the head
// is read off the trees the wire holds, whenever they change: the elements the
// screen's head holds go into the page's, and the page's own tags give way to
// them and come back (nova's head keeper).
//
// Terminal chrome, like the back trap beside it: the head is the terminal's
// relationship to the surface it is painted on, the same for every render
// target, and the app authors nothing to keep it. Where there is no document
// (a TTY, a TUI) there is no head, and this does nothing.
// ═══════════════════════════════════════════════════════════════

export const followHead = (api: TerminalApi, subscribe: (listener: () => void) => () => void): (() => void) => {
  if (typeof document === 'undefined') return () => undefined;
  const keep = createHeadKeeper(document);
  const read = (): void => keep(headOf(api)?.elements);
  read();
  return subscribe(read);
};
