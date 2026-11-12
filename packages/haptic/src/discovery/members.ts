import type { ExtractedRecord } from '../artifact/stage.js';
import type { Calls } from './calls.js';
import { MEMBERSHIP_QUESTION } from './prompts.js';

export type Label = {
  index: number;
  keep: boolean;
  by: 'example' | 'reader cited every item' | 'jev';
};

const clip = (value: string, n: number) => (value.length > n ? `${value.slice(0, n)}…` : value);
const sameValues = (a: ExtractedRecord, b: ExtractedRecord) =>
  JSON.stringify(a.fields) === JSON.stringify(b.fields);

const pool = async <T>(items: T[], size: number, work: (item: T) => Promise<void>) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        if (item !== undefined) await work(item);
      }
    }),
  );
};

const BATCH = 25;

// Which extracted records answer the instruction. A record holding a cited example answers it, and so does one with
// the same values. When the reader cited every item it counted, the rest do not; otherwise Jev decides each of the
// rest, up to 25 records in one call. No labels when no record holds an example, or when the rest are more than the
// Jev questions left.
export const labelRecords = async ({
  calls,
  instruction,
  records,
  cited,
  citedAll,
  concurrency,
}: {
  calls: Calls;
  instruction: string;
  records: ExtractedRecord[];
  cited: Set<number>;
  citedAll: boolean;
  concurrency: number;
}): Promise<Label[] | null> => {
  if (!cited.size) return null;
  const shown = (record: ExtractedRecord) => ({
    fields: record.fields,
    text: clip(
      String(record.text ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      600,
    ),
  });
  const examples = [...cited].slice(0, 5).flatMap((i) => (records[i] ? [shown(records[i])] : []));
  const labels = records.map(
    (record, index): { index: number; keep: boolean | null; by: Label['by'] } => {
      if (cited.has(index) || [...cited].some((i) => records[i] && sameValues(records[i], record)))
        return { index, keep: true, by: 'example' };
      if (citedAll) return { index, keep: false, by: 'reader cited every item' };
      return { index, keep: null, by: 'jev' };
    },
  );
  const open = labels.filter((l) => l.keep === null);
  if (open.length > calls.jevLeft()) {
    calls.event('members', { type: 'labels-skipped', open: open.length, jevLeft: calls.jevLeft() });
    return null;
  }
  const batches = Array.from({ length: Math.ceil(open.length / BATCH) }, (_, i) =>
    open.slice(i * BATCH, (i + 1) * BATCH),
  );
  await pool(batches, concurrency, async (batch) => {
    const keys = batch.map((_, i) => `r${i + 1}`);
    const answers = await calls.decide(
      'members',
      {
        instruction,
        examples,
        records: Object.fromEntries(
          batch.map((label, i) => [keys[i], shown(records[label.index] as ExtractedRecord)]),
        ),
      },
      Object.fromEntries(keys.map((key) => [key, MEMBERSHIP_QUESTION(key)])),
    );
    batch.forEach((label, i) => {
      const answer = answers[keys[i] as string];
      if (typeof answer === 'boolean') label.keep = answer;
      calls.event('members', { type: 'jev', index: label.index, keep: label.keep });
    });
  });
  return labels.filter((l): l is Label => l.keep !== null);
};
