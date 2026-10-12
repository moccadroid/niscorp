import { REF_TABLES } from '@encore/app/vex/ref-tables';
import type { CandidateSets, Entity, Parsed } from './intent.types';

export type HeardTag = { label: string; state: 'read' | 'matched' | 'confirmed'; tone: 'mute' | 'plain' | 'accent' };

const short = (label: string): string => label.split(',')[0] ?? label;

const wordsOf = (label: string): string[] => label.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word !== '');

// Closed tables send every row, matched or not, so a row counts only if a word of the sentence
// begins one of its label's words.
const isHeard = (label: string, tokens: readonly string[]): boolean => wordsOf(label).some((word) => tokens.some((token) => word.startsWith(token)));

// A row the previous pass confirmed (`standing`) keeps its tag while the new pass is out, or it
// would blink on every keystroke.
export const heardTags = (parsed: Parsed, candidates: CandidateSets, confirmed?: readonly Entity[], standing: readonly Entity[] = []): HeardTag[] => {
  const read: HeardTag[] = [
    ...(parsed.time !== undefined ? [parsed.time] : []),
    ...(parsed.day !== undefined ? [parsed.day] : []),
    ...(parsed.minutes !== undefined ? [`${parsed.minutes} min`] : []),
    ...(parsed.amount !== undefined ? [String(parsed.amount)] : []),
  ].map((label) => ({ label, state: 'read', tone: 'plain' }));

  if (confirmed !== undefined) return [...read, ...confirmed.map((entity): HeardTag => ({ label: short(entity.label), state: 'confirmed', tone: 'accent' }))];

  const matched = Object.entries(candidates).flatMap(([table, rows]): HeardTag[] => {
    const held = standing.filter((entity) => entity.table === table && rows.some((row) => row.id === entity.id));
    if (held.length > 0) return held.map((entity) => ({ label: short(entity.label), state: 'confirmed', tone: 'accent' }));
    const top = REF_TABLES[table]?.closed === true ? rows.find((row) => isHeard(row.label, parsed.tokens)) : rows[0];
    return top === undefined ? [] : [{ label: short(top.label), state: 'matched', tone: 'mute' }];
  });
  return [...read, ...matched];
};
