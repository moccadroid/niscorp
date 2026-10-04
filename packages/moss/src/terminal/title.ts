import { createTitleKeeper, headOf } from '@niscorp/nova/document';
import type { TerminalApi } from './index';

// ═══════════════════════════════════════════════════════════════
// The tab's title, kept on the screen.
//
// A drawn page arrives with its head written (../document). From then on the
// screen moves over the wire and the page is never fetched again, so the part
// of a head somebody can see — the title — is read off the trees the wire
// holds, whenever they change. A screen with no head has the page's own title.
//
// Terminal chrome, like the back trap beside it: the title is the terminal's
// relationship to the surface it is painted on, the same for every render
// target, and the app authors nothing to keep it. Where there is no document
// (a TTY, a TUI) there is no title, and this does nothing.
// ═══════════════════════════════════════════════════════════════

export const followTitle = (api: TerminalApi, subscribe: (listener: () => void) => () => void): (() => void) => {
  if (typeof document === 'undefined') return () => undefined;
  const keep = createTitleKeeper(document);
  const read = (): void => keep(headOf(api)?.head);
  read();
  return subscribe(read);
};
