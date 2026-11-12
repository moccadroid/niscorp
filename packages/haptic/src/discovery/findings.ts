import type { CheerioAPI } from 'cheerio';
import { fold } from '../artifact/fold.js';
import type { ExtractedRecord, FieldValue } from '../artifact/stage.js';
import type { FieldRule } from '../artifact/schema.js';
import type { Label } from './members.js';
import type { Example, ReadAnswer } from './read.js';

type Wanted = Record<string, string | null | (string | null)[]>;
type Gap = {
  missing: Record<string, FieldValue>[];
  extra: Record<string, FieldValue>[];
  count: { items: number; keep: number } | null;
};

const clip = (value: string, n: number) => (value.length > n ? `${value.slice(0, n)}…` : value);
const itemsOf = (data: unknown): unknown[] =>
  Array.isArray(data)
    ? data
    : (Object.values((data as object) ?? {}).find(Array.isArray) ?? [data]);
const field = (item: unknown, name: string) =>
  item && typeof item === 'object' ? (item as Record<string, unknown>)[name] : undefined;

// An address must be equal; text must be contained. A list must hold every wanted value.
export const holds = (got: unknown, want: unknown, isUrl: boolean): boolean => {
  if (Array.isArray(want)) return want.every((w) => holds(got, w, isUrl));
  if (want == null || got == null) return false;
  if (Array.isArray(got)) return got.some((g) => holds(g, want, isUrl));
  return isUrl
    ? String(got).replace(/#.*$/, '') === String(want).replace(/#.*$/, '')
    : fold(String(got)).includes(fold(String(want)));
};

export const baseOf = ($: CheerioAPI, url: string) => {
  try {
    return new URL($('base[href]').attr('href') ?? url, url).href;
  } catch {
    return url;
  }
};

// Each example as the records give it: an address resolved against the page, text as cited.
export const exampleValues = (example: Example, $: CheerioAPI, base: string): Wanted =>
  Object.fromEntries(
    Object.entries(example).map(([k, cited]) => {
      const values = cited.map((c) => {
        if (!c.attribute) return (c.text ?? $(c.element).text()).replace(/\s+/g, ' ').trim();
        try {
          return new URL($(c.element).attr(c.attribute) ?? '', base).href;
        } catch {
          return null;
        }
      });
      return [k, cited.some((c) => c.kind === 'lines') ? values : (values[0] ?? null)];
    }),
  );

export const hasExample = (fields: unknown, want: Wanted, example: Example) =>
  Object.entries(want).every(([k, w]) =>
    holds(field(fields, k), w, Boolean(example[k]?.[0]?.attribute)),
  );

// Examples missing from the result: those the records still have can be asked for; those the stage lost cannot.
export const compareExamples = (
  data: unknown,
  examples: Example[],
  $: CheerioAPI,
  base: string,
  records: ExtractedRecord[],
) => {
  const items = itemsOf(data);
  const missing: Wanted[] = [];
  const lost: Wanted[] = [];
  for (const example of examples) {
    const want = exampleValues(example, $, base);
    if (items.some((item) => hasExample(item, want, example))) continue;
    (records.some((r) => hasExample(r.fields, want, example)) ? missing : lost).push(want);
  }
  return { missing, lost };
};

// A result item stands for a record when it holds every value the record has.
const standsFor = (item: unknown, record: ExtractedRecord, fields: Record<string, FieldRule>) =>
  Object.entries(record.fields).every(
    ([k, v]) =>
      v == null ||
      (Array.isArray(v) && !v.length) ||
      holds(field(item, k), v, fields[k]?.attribute === 'href'),
  );

const sameValues = (a: ExtractedRecord, b: ExtractedRecord) =>
  JSON.stringify(a.fields) === JSON.stringify(b.fields);

// Records the result should keep but does not, records it keeps but should not, and how many items it should have.
export const compareLabels = (
  data: unknown,
  labels: Label[],
  records: ExtractedRecord[],
  fields: Record<string, FieldRule>,
): Gap => {
  const items = itemsOf(data);
  const missing: Gap['missing'] = [];
  const extra: Gap['extra'] = [];
  const keep = labels.filter((l) => l.keep).length;
  const count = items.length === keep ? null : { items: items.length, keep };
  for (const label of labels) {
    const record = records[label.index];
    if (!record) continue;
    const present = items.some((item) => standsFor(item, record, fields));
    if (label.keep && !present) missing.push(record.fields);
    // A record with the same values as one to keep cannot be told apart from it.
    const twin = labels.some(
      (l) => l.keep && records[l.index] && sameValues(records[l.index] as ExtractedRecord, record),
    );
    if (!label.keep && present && !twin) extra.push(record.fields);
  }
  return { missing, extra, count };
};

export const labelsDiffer = (gap: Gap) =>
  Boolean(gap.missing.length || gap.extra.length || gap.count);

export const labelRetry = ({ missing, extra, count }: Gap) =>
  [
    'The result does not match which records answer the request.',
    ...(count
      ? [
          `The result has ${count.items} items, but ${count.keep} records answer the request: leave the others out rather than giving them empty values.`,
        ]
      : []),
    ...(missing.length
      ? [
          'Records that answer it but are not in the result:',
          ...missing.slice(0, 10).map((f) => `- ${clip(JSON.stringify(f), 300)}`),
        ]
      : []),
    ...(extra.length
      ? [
          'Records that do not answer it but are in the result:',
          ...extra.slice(0, 10).map((f) => `- ${clip(JSON.stringify(f), 300)}`),
        ]
      : []),
    'Change the program so it keeps the first and leaves out the second. Choose them by what the records say; a list of their exact values breaks when the page changes.',
  ].join('\n');

// What the result is checked against: the cited examples, the labels, and on one page the reader's count.
export const resultFindings = ({
  data,
  examples,
  $,
  base,
  records,
  read,
  onePage,
  labels,
  fields,
}: {
  data: unknown;
  examples: Example[];
  $: CheerioAPI;
  base: string;
  records: ExtractedRecord[];
  read: ReadAnswer;
  onePage: boolean;
  labels: Label[] | null;
  fields: Record<string, FieldRule>;
}): string[] => {
  const { missing, lost } = compareExamples(data, examples, $, base, records);
  const out = [
    ...missing.map((w) => `example not in the result: ${clip(JSON.stringify(w), 300)}`),
    ...lost.map((w) => `example not in the extracted records: ${clip(JSON.stringify(w), 300)}`),
  ];
  if (
    onePage &&
    read.count !== null &&
    read.limit === null &&
    Array.isArray(data) &&
    data.length !== read.count
  )
    out.push(`${data.length} items, the reader counted ${read.count}`);
  if (labels) {
    const gap = compareLabels(data, labels, records, fields);
    out.push(
      ...gap.missing.map(
        (f) =>
          `record that answers the request is not in the result: ${clip(JSON.stringify(f), 200)}`,
      ),
    );
    out.push(
      ...gap.extra.map(
        (f) =>
          `record that does not answer the request is in the result: ${clip(JSON.stringify(f), 200)}`,
      ),
    );
    if (gap.count)
      out.push(
        `the result has ${gap.count.items} items, ${gap.count.keep} records answer the request`,
      );
  }
  return out;
};

// The count finding is the reader's own guess; every other finding is code checking the result against what the reader cited.
export const isCountFinding = (finding: string) => /items, the reader counted \d+$/.test(finding);
