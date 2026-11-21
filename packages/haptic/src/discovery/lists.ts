import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import type { Example, ReadAnswer } from './read.js';
import { extractRecord, fragility, type FoundRule, type ListOption } from './rules.js';

export type RecordList = ListOption & { required: string[] };

const norm = (v: unknown) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Fields every example has a value for: a record without one of them is not an item (a header row, a spacer).
export const requiredFields = (examples: Example[], fields: Record<string, FoundRule | null>) =>
  Object.keys(fields).filter((k) => fields[k] && examples.every((e) => e[k]?.length));

const hasAll = (
  $: CheerioAPI,
  record: Element,
  fields: Record<string, FoundRule | null>,
  required: string[],
  base: string,
) =>
  required.every((k) =>
    (extractRecord($, record, { [k]: fields[k] ?? null }, base)[k] ?? []).some((v) => v),
  );

// A list keeps only the records that have every required field. The stage stores those fields, so a run drops the same records.
const withRequired = (
  $: CheerioAPI,
  list: ListOption,
  examples: Example[],
  base: string,
): RecordList => {
  const required = requiredFields(examples, list.fields);
  const matched = list.matched.filter((r) => hasAll($, r, list.fields, required, base));
  return { ...list, required, matched, count: matched.length };
};

// The lists a reader would tell apart: same first records means one option; the stablest rule stands for them.
export const distinctLists = (
  $: CheerioAPI,
  options: ListOption[],
  read: Pick<ReadAnswer, 'limit' | 'count'>,
  examples: Example[],
  base: string,
): RecordList[] => {
  const shownN = Math.min(Math.max(read.limit ?? read.count ?? 5, 5), 10);
  const all = options
    .map((l) => withRequired($, l, examples, base))
    .filter((l) => l.records.every((r) => l.matched.includes(r)));
  const inLimit = (list: RecordList) =>
    !read.limit || list.records.every((r) => list.matched.indexOf(r) < (read.limit ?? 0));
  const fitting = all.filter(inLimit);
  const distinct = new Map<string, RecordList>();
  for (const list of [...(fitting.length ? fitting : all)].sort(
    (a, b) => fragility(a.selector) - fragility(b.selector),
  )) {
    // With a limit a run keeps the first `limit` records, so lists that agree on those are one option.
    const key = read.limit
      ? list.matched
          .slice(0, read.limit)
          .map((r) => norm($(r).text()))
          .join('|')
      : `${list.count}:` +
        list.matched
          .slice(0, shownN)
          .map((r) => norm($(r).text()))
          .join('|');
    if (!distinct.has(key)) distinct.set(key, list);
  }
  return [...distinct.values()];
};

// The list whose length is nearest the count the reader saw; among those, the one with the fewest records.
export const pickList = <T extends { count: number }>(
  lists: T[],
  count: number | null,
): T | undefined =>
  [...lists].sort(
    (a, b) =>
      (count ? Math.abs(a.count - count) - Math.abs(b.count - count) : 0) || a.count - b.count,
  )[0];
