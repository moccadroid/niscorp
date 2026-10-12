import { STOPWORDS } from './parse';
import type { CandidateSets, Superseded } from './intent.types';

// What follows a replaces marker ("the tent no the grove") replaces the row said last before it.
// What follows a rejects marker ("the grove, not the tent") is itself the row not meant.

export type SupersedeResult = { candidates: CandidateSets; superseded: Superseded[] };

// Rejects are matched first: "instead of" must be read before "instead".
const REJECTS: readonly (readonly string[])[] = [['instead', 'of'], ['rather', 'than'], ['not']];
const REPLACES: readonly (readonly string[])[] = [['scratch', 'that'], ['i', 'mean'], ['no'], ['actually'], ['instead'], ['rather']];

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
        // Not when the survivor was itself said after that row and before the marker:
        // "the tent, the grove, no, the grove" takes nothing back.
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

const nameOf = (label: string): string => label.split(' — ')[0] ?? label;
export const supersededNotes = (superseded: readonly Superseded[]): string[] => superseded.map((entry) => `"${nameOf(entry.label)}" was taken back ("${entry.marker}"): "${nameOf(entry.by.label)}" is meant in its place`);
