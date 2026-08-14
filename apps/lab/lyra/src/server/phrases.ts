// THE GREETING COMPOSER — pure, and the whole of this file.
//
// The books themselves are entries now (`phrases/book`, `phrases/integrations`,
// folded by `bookOverWire` in app.ts), read over each session's own wire when
// its shell is built. What used to be here — `BY_LOCALE`, every phrase for
// every language resident at boot — existed so a synchronous seam could
// answer, and left with the seam.
export type Phrasebook = Readonly<Record<string, string>>;

// Composed from a book the caller already has, rather than fetching one. The
// two places that greet somebody (the opening paint and `nav.identity`) both
// hold the phrasebook by the time they need this, and a second fetch here is
// how the same sentence gets to disagree with itself.
export const greetingFrom = (book: Phrasebook, name: string, at: Date): string => {
  const hour = at.getHours();
  const stem = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name.split(' ')[0] ?? name;
  return `${book[stem] ?? stem}, ${first}`;
};
