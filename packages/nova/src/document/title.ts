import type { Head } from '../layout/head';

// ═══════════════════════════════════════════════════════════
// The tab's title follows the screen.
//
// A drawn page arrives with its head written (`placeHead`). From then on the
// shell is live and the screen moves without the page being fetched again, so
// the one part of a head a person can see — the title — is kept on whatever
// head the screen has now.
//
// A screen with no head has the document's own title: the one `index.html`
// was written with, which a drawn page keeps beside the screen's (`data-own`).
//
// A keeper that was never handed a head never writes. Two shells can share a
// page (an inspector beside the app), and the one with nothing to say must not
// take the title back from the one that has.
// ═══════════════════════════════════════════════════════════

export type TitleKeeper = (head: Head | undefined) => void;

export const createTitleKeeper = (doc: Pick<Document, 'title' | 'querySelector'>): TitleKeeper => {
  const own = doc.querySelector('title')?.getAttribute('data-own') ?? doc.title;
  let said: string | undefined;
  return (head) => {
    const title = head?.title;
    if (title === said) return;
    said = title;
    const next = title ?? own;
    if (doc.title !== next) doc.title = next;
  };
};
