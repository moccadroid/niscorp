// WHAT A CARD AMOUNTED TO, IN THE OPERATOR'S TERMS — action id → a phrase.
//
// The rail is a log of the shift, and a shift is not made of action ids. A
// sentence Jev handled alone is recorded as what the operator DID with it:
// "moved Nova Kestrel → The Tent, 21:00 · not submitted". That sentence is
// authored here, per form, as a template over the form's own input keys — the
// same kind of fact about an action as which canvas it lands on, and kept beside
// that one for the same reason: the loop fills the braces and knows nothing
// about moving sets.
//
// `{key}` is the value the card holds for that input. Where the key is a row
// reference the loop writes the row's NAME, not its id. A brace whose value is
// empty takes its separator with it — "moved Nova Kestrel → The Tent" when no
// time was said. Cards absent from here are views, and are listed by title.

export type RailPhrase = {
  // Pieces, in order. A piece is dropped whole when its one brace is empty.
  pieces: readonly string[];
};

export const RAIL_PHRASES: Record<string, RailPhrase> = {
  'slot.swap': { pieces: ['moved {actId}', ' → {toStageId}', ', {time}'] },
  'set.delay': { pieces: ['held {actId}', ' {minutes} min'] },
  'push.compose': { pieces: ['drafted a push', ' to {audience}'] },
};

export const SUBMITTED = 'submitted';
export const NOT_SUBMITTED = 'not submitted';
