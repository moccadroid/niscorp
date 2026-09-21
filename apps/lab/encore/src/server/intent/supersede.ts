import { STOPWORDS } from './parse';
import type { CandidateSets, Superseded } from './intent.types';

// LANE 2½ — A CORRECTION IS READ, NOT JUDGED. Pure.
//
// "move the headliner to the tent no the grove" left To = The Tent on the real
// model. It passed every check because the fake scorer had a negation cue — the
// sixth rule the fake hid. A model that reads "the tent" and "the grove" in one
// sentence has two good answers and picks the first; asking it nicely to mind
// the word "no" is a prompt, and a prompt is a hope.
//
// So it is made structural, the way "at 9" is: a row the speaker took back is NOT
// AN OPTION. It is removed from the pass's candidate sets before a question is
// derived from them, so no model — calibrated, middling or lexical — can pick it.
//
// TWO KINDS OF MARKER, because English has two:
//
//   replaces   "the tent NO the grove" · "the tent, ACTUALLY the grove" · "I MEAN" ·
//              "SCRATCH THAT" · "INSTEAD" · "RATHER". What FOLLOWS the marker
//              replaces the same-table row mentioned LAST before it.
//   rejects    "the grove, NOT the tent" · "the grove INSTEAD OF the tent" · "the
//              grove RATHER THAN the tent". What follows the marker is the thing
//              NOT meant: it goes, provided another row of its table was mentioned
//              at all. (Treating "not" like "no" would take The Grove back in "to
//              the grove, not the tent" — deterministically wrong, for every model.)
//
// A ROW IS MENTIONED when a word of the sentence begins a word of its label AND
// OF NO OTHER ROW'S in that table: "stage" names four stages and therefore none.
// Rows of different tables never touch each other: "move Nova Kestrel, no, to the
// grove" takes nobody back. A marker with nothing after it changes nothing, and
// neither does "do not delay" — no row follows it.

export type SupersedeResult = { candidates: CandidateSets; superseded: Superseded[] };

// Longest first: "instead of" must be read before "instead".
const REJECTS: readonly (readonly string[])[] = [['instead', 'of'], ['rather', 'than'], ['not']];
const REPLACES: readonly (readonly string[])[] = [['scratch', 'that'], ['i', 'mean'], ['no'], ['actually'], ['instead'], ['rather']];

// The same floor the parser uses: a shorter prefix matches too much.
const MIN_MENTION_LENGTH = 3;

const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9&]+/).filter((word) => word !== '');

type Marker = { at: number; length: number; kind: 'replaces' | 'rejects'; text: string };

const markerAt = (words: readonly string[], at: number): Marker | undefined => {
  const match = (phrases: readonly (readonly string[])[]): readonly string[] | undefined => phrases.find((phrase) => phrase.every((word, offset) => words[at + offset] === word));
  const rejects = match(REJECTS);
  if (rejects !== undefined) return { at, length: rejects.length, kind: 'rejects', text: rejects.join(' ') };
  const replaces = match(REPLACES);
  return replaces === undefined ? undefined : { at, length: replaces.length, kind: 'replaces', text: replaces.join(' ') };
};

const markersOf = (words: readonly string[]): Marker[] => {
  const markers: Marker[] = [];
  for (let at = 0; at < words.length; at += 1) {
    const marker = markerAt(words, at);
    if (marker === undefined) continue;
    markers.push(marker);
    at += marker.length - 1;
  }
  return markers;
};

type Mention = { at: number; id: string; label: string };

// Every unambiguous mention of a row of one table, in the order it was said.
const mentionsOf = (words: readonly string[], rows: CandidateSets[string], skipped: ReadonlySet<number>): Mention[] =>
  words.flatMap((word, at) => {
    if (word.length < MIN_MENTION_LENGTH || STOPWORDS.has(word) || skipped.has(at)) return [];
    const named = rows.filter((row) => wordsOf(row.label).some((labelWord) => labelWord.startsWith(word)));
    const only = named.length === 1 ? named[0] : undefined;
    return only === undefined ? [] : [{ at, id: only.id, label: only.label }];
  });

export const supersede = (line: string, candidates: CandidateSets): SupersedeResult => {
  const words = wordsOf(line);
  const markers = markersOf(words);
  if (markers.length === 0) return { candidates, superseded: [] };
  // A marker's own words are not mentions: "no" begins "Nova".
  const markerWords = new Set(markers.flatMap((marker) => Array.from({ length: marker.length }, (_, offset) => marker.at + offset)));

  const superseded: Superseded[] = [];
  for (const [table, rows] of Object.entries(candidates)) {
    const mentions = mentionsOf(words, rows, markerWords);
    const gone = new Set<string>();
    for (const marker of markers) {
      const standing = mentions.filter((mention) => !gone.has(mention.id));
      const next = standing.find((mention) => mention.at > marker.at);
      if (next === undefined) continue;
      if (marker.kind === 'replaces') {
        const last = standing.filter((mention) => mention.at < marker.at && mention.id !== next.id).at(-1);
        // ...and only if the survivor is not itself something said earlier and
        // kept: "the grove, no, the grove" takes nothing back.
        if (last === undefined || standing.some((mention) => mention.at < marker.at && mention.id === next.id && mention.at > last.at)) continue;
        gone.add(last.id);
        superseded.push({ table, id: last.id, label: last.label, by: { id: next.id, label: next.label }, marker: marker.text });
      } else {
        const other = standing.filter((mention) => mention.id !== next.id).at(-1);
        if (other === undefined) continue;
        gone.add(next.id);
        superseded.push({ table, id: next.id, label: next.label, by: { id: other.id, label: other.label }, marker: marker.text });
      }
    }
  }
  if (superseded.length === 0) return { candidates, superseded };
  const removed = new Set(superseded.map((entry) => `${entry.table}:${entry.id}`));
  return {
    candidates: Object.fromEntries(Object.entries(candidates).map(([table, rows]) => [table, rows.filter((row) => !removed.has(`${table}:${row.id}`))])),
    superseded,
  };
};

// What Jev is told, beside the line exactly as it was typed: the row is already
// not an option, and the note is why the sentence still names it.
const nameOf = (label: string): string => label.split(' — ')[0] ?? label;
export const supersededNotes = (superseded: readonly Superseded[]): string[] => superseded.map((entry) => `"${nameOf(entry.label)}" was taken back ("${entry.marker}"): "${nameOf(entry.by.label)}" is meant in its place`);
