import { REF_TABLES } from '@encore/app/vex/ref-tables';
import type { CandidateSets, Entity, Parsed } from './intent.types';

// WHAT WAS HEARD — the instant lane's one output. Pure.
//
// Two lanes of a pass are local and done in about ten milliseconds: the parser
// has read the values ("at 9" → 21:00) and retrieval has the rows the words
// matched. Until now both waited, invisibly, for a decision a network away.
// These are the tags that go on the line the moment they exist.
//
// THEY ARE MATCHES, NOT DECISIONS, and the difference is kept on screen:
//
//   read       a value the parser read. Never in doubt, never dropped — nobody
//              judges whether "at 9" said nine.
//   matched    the top row retrieval found for a table. A guess: the words hit
//              this label. Shown muted, the instant it is known.
//   confirmed  the same row, after the pass, if the model picked it. A matched
//              row the model did NOT pick is dropped: the room heard wrong, and
//              says so by taking the tag back.
//
// One tag per table — the top hit — so the line carries a handful, not a list.

export type HeardTag = { label: string; state: 'read' | 'matched' | 'confirmed'; tone: 'mute' | 'plain' | 'accent' };

// A candidate label is "name — disambiguator, more"; a tag wants the first two.
const short = (label: string): string => label.split(',')[0] ?? label;

const wordsOf = (label: string): string[] => label.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word !== '');

// CLOSED tables send every row whether or not anything matched, so "retrieved"
// is not "heard": a row counts only if a word of the sentence begins one of the
// label's words. OPEN tables were already narrowed by those same words.
const isHeard = (label: string, tokens: readonly string[]): boolean => wordsOf(label).some((word) => tokens.some((token) => word.startsWith(token)));

// `confirmed` absent = BEFORE the pass: show what matched. Present = AFTER it:
// show what the model picked, and nothing it did not.
//
// `standing` is what the PREVIOUS pass confirmed. A row it picked, still among
// this pass's candidates, keeps its confirmed tag while the new pass is out —
// otherwise every keystroke would demote "Nova Kestrel" to a guess for a third
// of a second and promote it again, and a tag that blinks reads as doubt.
export const heardTags = (parsed: Parsed, candidates: CandidateSets, confirmed?: readonly Entity[], standing: readonly Entity[] = []): HeardTag[] => {
  const read: HeardTag[] = [
    ...(parsed.time !== undefined ? [parsed.time] : []),
    ...(parsed.day !== undefined ? [parsed.day] : []),
    ...(parsed.minutes !== undefined ? [`${parsed.minutes} min`] : []),
    ...(parsed.amount !== undefined ? [String(parsed.amount)] : []),
  ].map((label) => ({ label, state: 'read', tone: 'plain' }));

  // After a pass, the model's picks ARE the row tags: whatever it confirmed,
  // whether or not it was the top match.
  if (confirmed !== undefined) return [...read, ...confirmed.map((entity): HeardTag => ({ label: short(entity.label), state: 'confirmed', tone: 'accent' }))];

  const matched = Object.entries(candidates).flatMap(([table, rows]): HeardTag[] => {
    const held = standing.filter((entity) => entity.table === table && rows.some((row) => row.id === entity.id));
    if (held.length > 0) return held.map((entity) => ({ label: short(entity.label), state: 'confirmed', tone: 'accent' }));
    const top = REF_TABLES[table]?.closed === true ? rows.find((row) => isHeard(row.label, parsed.tokens)) : rows[0];
    return top === undefined ? [] : [{ label: short(top.label), state: 'matched', tone: 'mute' }];
  });
  return [...read, ...matched];
};
