import { resolveAddress, selectHtml } from '../web/html.js';
import type { HttpSource } from '../web/source.js';
import { fold } from './fold.js';
import type { FieldRule, LinkStage, RecordStage, Where } from './schema.js';

export type FieldValue = string | null | string[];
export type ExtractedRecord = {
  sourceUrl: string;
  text: string;
  attributes: Record<string, string>;
  fields: Record<string, FieldValue>;
};

const valueIn = (record: ExtractedRecord, place: string): string =>
  fold(
    place === 'text'
      ? record.text
      : [record.fields[place]]
          .flat()
          .filter((value) => value != null)
          .join(' '),
  );

// The stage's where test: kept when the field (or the record's text) contains the phrase, both folded.
export const passes = (record: ExtractedRecord, where: Where | null): boolean =>
  !where || valueIn(record, where.in).includes(fold(where.contains));

const rulesOf = (fields: Record<string, FieldRule>) =>
  Object.fromEntries(
    Object.entries(fields).map(([name, { selector, attribute, closest }]) => [
      name,
      { selector, attribute, ...(closest ? { closest } : {}) },
    ]),
  );

// The records one page yields: required fields, then where, then the limit. Values are cleaned the way the program
// sees them: text with whitespace collapsed, addresses resolved; one value per field unless it collects a list.
// A record whose every field equals an earlier record's is the same item again (one link behind its text, its image
// and its file name) and is left out.
export const readRecords = (
  source: HttpSource,
  stage: RecordStage,
  signal: AbortSignal,
): ExtractedRecord[] => {
  const selection = selectHtml(source, stage.selector, rulesOf(stage.fields), signal);
  const clean = (value: string | null, rule: FieldRule): string | null => {
    if (value === null) return null;
    if (rule.attribute === 'href')
      return resolveAddress(value, selection.baseUrl, selection.encoding);
    return value.replace(/\s+/g, ' ').trim() || null;
  };
  const records: ExtractedRecord[] = [];
  const seen = new Set<string>();
  for (const item of selection.items) {
    if (stage.limit && records.length >= stage.limit) break;
    if (
      !stage.required.every((name) =>
        (item.fields[name] ?? []).some((value) => value && value.trim()),
      )
    )
      continue;
    const fields: Record<string, FieldValue> = {};
    for (const [name, rule] of Object.entries(stage.fields)) {
      const found = (item.fields[name] ?? []).map((value) => clean(value, rule));
      fields[name] = rule.list
        ? found.filter((value): value is string => value !== null)
        : (found[0] ?? null);
    }
    const record = { sourceUrl: source.url, text: item.text, attributes: item.attributes, fields };
    const same = JSON.stringify(fields);
    if (!passes(record, stage.where) || seen.has(same)) continue;
    seen.add(same);
    records.push(record);
  }
  return records;
};

// The addresses a link stage leads to on one page: the first link of each record, resolved, fragments removed when
// the policy says so, without addresses already visited or already chosen, up to `room`.
export const readLinks = (
  source: HttpSource,
  stage: LinkStage,
  options: { visited: ReadonlySet<string>; room: number; stripFragments: boolean },
  signal: AbortSignal,
): string[] => {
  const selection = selectHtml(
    source,
    stage.selector,
    { link: { selector: stage.link.selector, attribute: stage.link.attribute } },
    signal,
  );
  const out: string[] = [];
  for (const item of selection.items) {
    if (out.length >= options.room) break;
    const raw = (item.fields.link ?? []).find((value): value is string => Boolean(value));
    if (!raw) continue;
    const resolved = resolveAddress(raw, selection.baseUrl, selection.encoding);
    if (!resolved) continue;
    const address = options.stripFragments ? resolved.replace(/#.*$/, '') : resolved;
    if (!options.visited.has(address) && !out.includes(address)) out.push(address);
  }
  return out;
};
