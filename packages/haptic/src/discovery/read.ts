import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { z } from 'zod';
import { fold } from '../artifact/fold.js';
import { renderLines, resolveText, type Line } from './view.js';

const Value = z.union([
  z.object({ line: z.number().int(), text: z.string().min(1) }).strict(),
  z.object({ line: z.number().int(), link: z.literal(true) }).strict(),
  z.object({ lines: z.array(z.number().int()).min(1) }).strict(),
]);
export const ReadAnswerSchema = z
  .object({
    items: z.array(z.object({ fields: z.record(z.string().min(1), Value) }).strict()).max(5),
    count: z.number().int().nonnegative().nullable(),
    limit: z.number().int().positive().nullable(),
    follow: z.array(z.number().int()).nullable(),
    next: z.string().min(1).nullable(),
  })
  .strict();
export type ReadAnswer = z.infer<typeof ReadAnswerSchema>;

// One cited page element: a line's text (or part of it), a link's address, or one of a field's several lines.
export type Cited = {
  element: Element;
  attribute: string | null;
  kind: 'lines' | 'link' | 'text';
  text?: string;
};
export type Example = Record<string, Cited[]>;
export type Resolved = { problems: string[]; examples: Example[]; follow: Line[] };

const clip = (value: string, n: number) => (value.length > n ? `${value.slice(0, n)}…` : value);
const NEAR = 2;

// Turns a Read answer into cited page elements, with the problems a retry message lists.
export const resolveAnswer = (
  $: CheerioAPI,
  lines: Line[],
  answer: ReadAnswer,
  {
    fieldNames,
    mayFollow,
    base,
  }: { fieldNames: string[] | null; mayFollow: boolean; base: string },
): Resolved => {
  const byNumber = new Map(lines.map((l) => [l.number, l]));
  const near = (n: number) => lines.filter((l) => Math.abs(l.number - n) <= NEAR);
  // A citation one or two lines off: the lines around it as the reader sees them, choosing none.
  const around = (n: number) =>
    `Lines ${Math.max(1, n - NEAR)} to ${n + NEAR} read:\n${renderLines(near(n), base)
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n')}`;
  const holding = (n: number, text: string) => {
    const found = near(n)
      .filter((l) => l.number !== n && fold(l.text).includes(fold(text)))
      .map((l) => l.number);
    return found.length
      ? ` ${found.length === 1 ? `Line ${found[0]} contains` : `Lines ${found.join(' and ')} contain`} it.`
      : '';
  };
  const problems: string[] = [];
  if (answer.follow?.length && !mayFollow)
    problems.push('Following links is not allowed here; follow must be null.');
  for (const n of answer.follow ?? [])
    if (!byNumber.get(n)?.link) problems.push(`Line ${n} is not a link. ${around(n)}`);
  if (!answer.items.length && !answer.follow?.length)
    problems.push(
      mayFollow
        ? 'Give items, or follow when the answer is on linked pages.'
        : 'Give items: links are not followed from this page, so the instruction is answered from this page itself.',
    );
  if (answer.follow?.length && !answer.next)
    problems.push(
      'You listed links in follow, so next must say what to take from each linked page.',
    );
  if (fieldNames)
    for (const item of answer.items)
      for (const k of Object.keys(item.fields))
        if (!fieldNames.includes(k))
          problems.push(`"${k}" is not one of the field names: ${fieldNames.join(', ')}.`);
  // A line belongs to one item.
  const itemsOfLine = new Map<number, number[]>();
  answer.items.forEach((item, index) => {
    for (const value of Object.values(item.fields))
      for (const n of new Set('lines' in value ? value.lines : [value.line]))
        itemsOfLine.set(n, [...new Set([...(itemsOfLine.get(n) ?? []), index + 1])]);
  });
  const shared = new Map<string, number[]>();
  for (const [n, items] of itemsOfLine)
    if (items.length > 1) shared.set(items.join(','), [...(shared.get(items.join(',')) ?? []), n]);
  for (const [key, ns] of shared) {
    const items = key.split(',').map(Number);
    const who =
      items.length === 2
        ? `Items ${items[0]} and ${items[1]} both cite`
        : items.every((v, i) => i === 0 || v === (items[i - 1] ?? 0) + 1)
          ? `Items ${items[0]} to ${items.at(-1)} all cite`
          : `Items ${items.slice(0, -1).join(', ')} and ${items.at(-1)} all cite`;
    const where =
      ns.length === 1 ? `line ${ns[0]}` : `lines ${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`;
    problems.push(
      `${who} ${where}, and a line belongs to one item. If these are parts of one item, give them as one item; if they are separate items, cite for each only lines that belong to it alone.`,
    );
  }
  const examples = answer.items.map((item) =>
    Object.fromEntries(
      Object.entries(item.fields).map(([field, value]): [string, Cited[]] => {
        if ('lines' in value) {
          const cited = value.lines.map((n) => byNumber.get(n));
          if (cited.some((l) => !l))
            problems.push(`${field}: a line in ${JSON.stringify(value.lines)} does not exist.`);
          const present = cited.filter((l): l is Line => Boolean(l));
          const kept = present.filter(
            (l) => !present.some((o) => o !== l && $(o.element).find(l.element).length),
          );
          return [field, kept.map((l) => ({ element: l.element, attribute: null, kind: 'lines' }))];
        }
        const line = byNumber.get(value.line);
        if (!line) {
          problems.push(`${field}: line ${value.line} does not exist.`);
          return [field, []];
        }
        if ('link' in value) {
          if (!line.link)
            problems.push(`${field}: line ${value.line} is not a link. ${around(value.line)}`);
          return [
            field,
            line.link && line.linkElement
              ? [{ element: line.linkElement, attribute: 'href', kind: 'link' }]
              : [],
          ];
        }
        const element = resolveText($, line, value.text);
        if (!element)
          problems.push(
            `${field}: line ${value.line} does not contain "${clip(value.text, 80)}". It reads: "${clip(line.text, 160)}".${holding(value.line, value.text)}`,
          );
        return [
          field,
          element ? [{ element, attribute: null, kind: 'text', text: value.text }] : [],
        ];
      }),
    ),
  );
  return {
    problems,
    examples,
    follow: (answer.follow ?? []).map((n) => byNumber.get(n)).filter((l): l is Line => Boolean(l)),
  };
};
