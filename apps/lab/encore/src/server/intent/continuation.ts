// IS THIS STILL THE SAME SENTENCE? Pure, and the whole rule.
//
// A room is made under a sentence: a chip the operator clicked, a card a plan
// step opened, a field somebody typed into, a run that already landed — all of
// it is a vote ABOUT THAT SENTENCE. The loop used to drop those votes only when
// the line went empty, and nobody empties a line: they select it and type over
// it. So a plan for a storm stayed pinned under "how many guests are there
// right now?", and the room answered a question nobody was asking any more.
//
// The rule compares the line against an ANCHOR — the furthest the current
// sentence has been typed — not against the previous keystroke. Against the
// previous keystroke, backspacing to "storm at 9" and typing "…close the gates"
// would be two continuations in a row, and the plan for the headliner would
// ride along into a sentence about gates.
//
//   TYPING FORWARD   the anchor is a prefix of the line → same sentence, and the
//                    anchor moves up to the line.
//   BACKSPACING      the line is a prefix of the anchor → same sentence, and the
//                    anchor STAYS: the operator may be about to retype it.
//   AN EDIT          neither is a prefix of the other. If the line still begins
//                    with at least 70% of the anchor it is a fix near the end —
//                    a typo in the last word, a different final clause — and
//                    the sentence continues from the edited line. Anything that
//                    reaches further back is a new sentence.
//
// The threshold is deliberately one-sided. A typo fixed EARLY in a long line is
// called a new sentence, which costs a pin and a re-decided run; a new sentence
// called a continuation costs a room that makes no sense. Common suffixes are
// not counted for the same reason: "move headliner to the tent" edited into
// "move lantern club to the tent" keeps most of its characters and none of its
// meaning.
//
// Compared trimmed, lowercased and with runs of space collapsed: a trailing
// space or a capital is not an edit.

export const CONTINUATION_KEEPS = 0.7;

const normalise = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

const commonPrefixLength = (a: string, b: string): number => {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
};

export const continues = (anchor: string, line: string): boolean => {
  const from = normalise(anchor);
  const to = normalise(line);
  // Nothing has been said yet, so nothing can be broken.
  if (from === '') return true;
  if (to.startsWith(from) || from.startsWith(to)) return true;
  return commonPrefixLength(from, to) >= CONTINUATION_KEEPS * from.length;
};

// Where the sentence stands after this line. A new sentence starts at the line;
// so does a forward continuation or an edit. Only backspacing leaves it alone.
export const anchorAfter = (anchor: string, line: string): string => {
  const from = normalise(anchor);
  const to = normalise(line);
  return continues(anchor, line) && from.startsWith(to) ? from : to;
};
