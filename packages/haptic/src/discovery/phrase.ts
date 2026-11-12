import { fold } from '../artifact/fold.js';
import type { ExtractedRecord } from '../artifact/stage.js';
import type { Where } from '../artifact/schema.js';
import type { Label } from './members.js';

const MAX_WORDS = 5;

const valueIn = (record: ExtractedRecord, place: string) =>
  fold(
    place === 'text'
      ? String(record.text ?? '')
      : [record.fields[place]]
          .flat()
          .filter((v) => v != null)
          .join(' '),
  );
const words = (value: string) =>
  value
    .split(/[^\p{L}\p{N}.\-/_]+/u)
    .map((w) => w.replace(/^[.\-/_]+|[.\-/_]+$/g, ''))
    .filter(Boolean);

// One phrase that every record to keep contains and no record to drop does: the longest wording the kept records
// share, in a field before the record text. Where all kept records hold one value, or the phrase is a whole kept
// value, it would only repeat today's values, so there is no test.
export const findWhere = (records: ExtractedRecord[], labels: Label[]): Where | null => {
  const keep = labels.filter((l) => l.keep).flatMap((l) => records[l.index] ?? []);
  const drop = labels.filter((l) => !l.keep).flatMap((l) => records[l.index] ?? []);
  const first = keep[0];
  if (!first || !drop.length) return null;
  const places = [...Object.keys(first.fields), 'text'];
  const whole = new Set(
    keep.flatMap((r) =>
      Object.values(r.fields)
        .flat()
        .map((v) => fold(String(v ?? ''))),
    ),
  );
  const found: Where[] = [];
  for (const place of places) {
    if (new Set(keep.map((r) => valueIn(r, place))).size < 2) continue;
    const phrases = new Set<string>();
    for (const r of keep) {
      const ws = words(valueIn(r, place));
      for (let n = 1; n <= MAX_WORDS; n++)
        for (let i = 0; i + n <= ws.length; i++) phrases.add(ws.slice(i, i + n).join(' '));
    }
    for (const phrase of phrases) {
      if (whole.has(phrase)) continue;
      if (
        keep.every((r) => valueIn(r, place).includes(phrase)) &&
        drop.every((r) => !valueIn(r, place).includes(phrase))
      )
        found.push({ in: place, contains: phrase });
    }
  }
  found.sort(
    (a, b) =>
      Number(a.in === 'text') - Number(b.in === 'text') ||
      b.contains.split(' ').length - a.contains.split(' ').length ||
      b.contains.length - a.contains.length,
  );
  return found[0] ?? null;
};
