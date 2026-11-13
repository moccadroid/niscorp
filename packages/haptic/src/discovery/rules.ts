import type { CheerioAPI } from 'cheerio';
import { isTag, type AnyNode, type Element } from 'domhandler';
import type { Cited, Example } from './read.js';
import { block } from './view.js';

export type FoundRule = { selector: string; attribute: string | null };
export type ListOption = {
  selector: string;
  count: number;
  matched: Element[];
  records: Element[];
  item: string;
  fields: Record<string, FoundRule | null>;
};
export type Candidates = { error: string } | { options: ListOption[]; examples: Example[] };

const norm = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const cssEscape = (value: string) => value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
// Attributes whose values differ per item; their presence says nothing about the kind of element.
const SKIP_ATTRS = new Set([
  'class',
  'style',
  'id',
  'href',
  'src',
  'srcset',
  'title',
  'alt',
  'aria-label',
  'width',
  'height',
  'value',
]);

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const TEXT_BLOCKS = [...HEADINGS, 'p', 'li', 'pre', 'blockquote'];

const parentTag = (node: AnyNode): Element | null =>
  node.parent && isTag(node.parent) ? node.parent : null;
const ancestors = (element: Element) => {
  const chain: Element[] = [];
  for (let node: Element | null = element; node; node = parentTag(node)) chain.push(node);
  return chain;
};
const lowestCommon = (elements: Element[]) => {
  const chains = elements.map(ancestors);
  return chains[0]?.find((candidate) => chains.every((chain) => chain.includes(candidate))) ?? null;
};
const contains = ($: CheerioAPI, outer: Element, inner: Element) =>
  outer === inner || $(outer).find(inner).length > 0;
const position = (element: Element) =>
  (element.parent?.children ?? []).filter(isTag).indexOf(element) + 1;

const levelSelectors = (element: Element) => {
  const out = [element.name];
  for (const name of Object.keys(element.attribs))
    if (!SKIP_ATTRS.has(name) && !name.startsWith('on')) out.push(`${element.name}[${name}]`);
  for (const cls of (element.attribs.class ?? '').split(/\s+/).filter(Boolean))
    out.push(`${element.name}.${cssEscape(cls)}`);
  return out;
};
const ownSelectors = (element: Element) => [
  ...levelSelectors(element),
  `${element.name}:nth-child(${position(element)})`,
];
const contextSelectors = (element: Element) => {
  const parent = parentTag(element);
  return parent ? levelSelectors(parent) : [];
};

// Lower is preferred: attribute values, escaped characters (utility classes), positions and nesting are what change first.
export const fragility = (selector: string) =>
  (selector.match(/="/g) ?? []).length * 2 +
  (selector.match(/\\./g) ?? []).length +
  (selector.match(/nth-child|:has\(/g) ?? []).length;
const byStability = (a: string, b: string) => fragility(a) - fragility(b) || a.length - b.length;

export const hits = ($: CheerioAPI, record: Element, selector: string): Element[] =>
  selector === ':scope'
    ? [record]
    : $(record)
        .find(
          selector
            .split(', ')
            .map((part) => part.replace(/^:scope > /, '> '))
            .join(', '),
        )
        .toArray();
export const valueOf = ($: CheerioAPI, element: Element, attribute: string | null) =>
  attribute ? ($(element).attr(attribute) ?? '') : norm($(element).text());

const relative = (record: Element, node: Element) => {
  if (node === record) return [':scope'];
  const path: Element[] = [];
  for (
    let current: Element | null = node;
    current && current !== record;
    current = parentTag(current)
  )
    path.unshift(current);
  const last = path.at(-1);
  if (!last) return [];
  const out = new Set(ownSelectors(last));
  for (const own of ownSelectors(last)) {
    out.add(`:scope > ${own}`);
    for (const ancestor of path.slice(0, -1))
      for (const a of ownSelectors(ancestor)) out.add(`${a} ${own}`);
  }
  return [...out];
};

type Pair = { cited: Cited[]; record: Element };

// A rule that gives every cited value in each record. A single value comes from the rule's first match, and one
// distinct value per record is preferred; a list takes the stablest rule, then the one with the fewest matches.
const ruleFor = (
  $: CheerioAPI,
  pairs: Pair[],
  attribute: string | null,
  many: boolean,
): string | undefined => {
  const candidates = pairs
    .flatMap((p) => p.cited.map((c) => relative(p.record, c.element)))
    .reduce((x, y) => x.filter((c) => y.includes(c)));
  const sameValue = (element: Element, c: Cited) =>
    element === c.element ||
    (valueOf($, element, attribute) !== '' &&
      valueOf($, element, attribute) === valueOf($, c.element, attribute));
  const covers = (selector: string) =>
    pairs.every((p) => {
      const found = hits($, p.record, selector);
      const first = found[0];
      const cited = p.cited[0];
      return many
        ? p.cited.every((c) => found.some((f) => sameValue(f, c)))
        : first !== undefined && cited !== undefined && sameValue(first, cited);
    });
  const single = (selector: string) =>
    pairs.every(
      (p) =>
        new Set(hits($, p.record, selector).map((e) => valueOf($, e, attribute))).size ===
        p.cited.length,
    );
  const total = (selector: string) =>
    pairs.reduce((sum, p) => sum + hits($, p.record, selector).length, 0);
  const fitting = candidates
    .filter(covers)
    .sort(
      (a, b) =>
        fragility(a) - fragility(b) || (many ? total(a) - total(b) : 0) || a.length - b.length,
    );
  return many ? fitting[0] : (fitting.find(single) ?? fitting[0]);
};

// Field rules shared by all example records. Each example field has one or more cited elements.
export const fieldRules = (
  $: CheerioAPI,
  records: Element[],
  examples: Example[],
): Record<string, FoundRule | null> => {
  const fields: Record<string, FoundRule | null> = {};
  for (const name of new Set(examples.flatMap((e) => Object.keys(e)))) {
    let pairs: Pair[] = examples.flatMap((e, i) => {
      const record = records[i];
      const cited = e[name];
      return record && cited?.length ? [{ cited, record }] : [];
    });
    if (!pairs.length) {
      fields[name] = null;
      continue;
    }
    const attribute = pairs[0]?.cited[0]?.attribute ?? null;
    const many = pairs.some((p) => p.cited.length > 1);
    const kindsOf = (ps: Pair[]) => new Set(ps.flatMap((p) => p.cited.map((c) => c.element.name)));
    if (many && !attribute && kindsOf(pairs).size > 1) {
      // Lines of several kinds: a cited link stands for its block (unless that is the record), then one rule per kind.
      pairs = pairs.map((p) => ({
        ...p,
        cited: [
          ...new Set(
            p.cited.map((c) => {
              const owner = c.element.name === 'a' ? block(c.element) : null;
              return owner && owner !== p.record && contains($, p.record, owner)
                ? owner
                : c.element;
            }),
          ),
        ].map((element): Cited => ({ element, attribute: null, kind: 'lines' })),
      }));
      // The cited lines are samples of one passage. When an element inside the record holds them all, the rule is
      // every block of their family in it (headings alone when only headings were cited); otherwise one rule per kind.
      const holders = pairs.map((p) => lowestCommon(p.cited.map((c) => c.element)));
      const passage = holders.every((holder, i) => holder && holder !== pairs[i]?.record)
        ? ruleFor(
            $,
            pairs.map((p, i) => ({
              record: p.record,
              cited: [{ element: holders[i] as Element, attribute: null, kind: 'lines' }],
            })),
            null,
            false,
          )
        : undefined;
      if (passage) {
        const family = [...kindsOf(pairs)].every((kind) => HEADINGS.includes(kind))
          ? HEADINGS
          : TEXT_BLOCKS;
        fields[name] = {
          selector: family.map((kind) => `${passage} ${kind}`).join(', '),
          attribute: null,
        };
        continue;
      }
      const parts = [...kindsOf(pairs)].map((kind) =>
        ruleFor(
          $,
          pairs
            .map((p) => ({ ...p, cited: p.cited.filter((c) => c.element.name === kind) }))
            .filter((p) => p.cited.length),
          null,
          true,
        ),
      );
      fields[name] = parts.every(Boolean) ? { selector: parts.join(', '), attribute: null } : null;
      continue;
    }
    const pick = ruleFor($, pairs, attribute, many);
    fields[name] = pick ? { selector: pick, attribute } : null;
  }
  return fields;
};

// Candidate record rules: lists of non-nested elements, each holding exactly one example's fields.
export const candidates = ($: CheerioAPI, examples: Example[]): Candidates => {
  const fieldElements = (example: Example) =>
    Object.values(example)
      .flat()
      .map((c) => c.element);
  const lcas = examples.map((example) => lowestCommon(fieldElements(example)));
  if (lcas.some((l) => !l)) return { error: 'an example has no common element' };
  if (examples.length > 1 && new Set(lcas).size < examples.length)
    return { error: 'two examples fall in one element; they must be separate items' };
  const holdsOnly = (element: Element, index: number) =>
    examples.every(
      (other, j) => j === index || !fieldElements(other).some((e) => contains($, element, e)),
    );
  const chains = lcas.map((lca, index) =>
    ancestors(lca as Element).filter(
      (e) =>
        e.name !== 'html' && (examples.length === 1 || e.name !== 'body') && holdsOnly(e, index),
    ),
  );
  const unique = (node: Element) =>
    Object.entries(node.attribs)
      .filter(
        ([name, value]) =>
          (name === 'id' || name.startsWith('data-')) && value && !/["\\\s]/.test(value),
      )
      .filter(([name, value]) => $(`[${name}="${value}"]`).length === 1)
      .map(([name, value]) => `${node.name}[${name}="${value}"]`);
  const selectors = new Set<string>();
  for (const element of chains[0] ?? []) {
    for (const own of ownSelectors(element)) {
      selectors.add(own);
      for (const context of contextSelectors(element)) selectors.add(`${context} > ${own}`);
    }
    // Anchored on an ancestor up to 4 levels up, or on the element just before one, whose id or data-* value is unique.
    let up = parentTag(element);
    for (let depth = 0; up && depth < 4; depth++, up = parentTag(up)) {
      let previous = up.prev;
      while (previous && !isTag(previous)) previous = previous.prev;
      const holder = up;
      const anchors = [
        ...unique(holder),
        ...(previous && isTag(previous) ? unique(previous).map((a) => `${a} + ${holder.name}`) : []),
      ];
      for (const anchor of anchors)
        for (const own of levelSelectors(element)) selectors.add(`${anchor} ${own}`);
    }
  }
  const options: Omit<ListOption, 'fields'>[] = [];
  const nests = (matched: Element[]) => {
    const set = new Set<AnyNode>(matched);
    return matched.some((e) => {
      for (let up = e.parent; up; up = up.parent) if (set.has(up)) return true;
      return false;
    });
  };
  for (const written of selectors) {
    let selector = written;
    let matched: Element[];
    try {
      matched = $(selector).toArray().filter(isTag);
      // Rows of a table inside a layout table: the rule keeps the innermost elements of its kind.
      if (nests(matched)) {
        selector = `${written}:not(:has(${matched[0]?.name}))`;
        matched = $(selector).toArray().filter(isTag);
      }
    } catch {
      continue;
    }
    if (matched.length < examples.length) continue;
    const set = new Set(matched);
    if (nests(matched)) continue;
    const records = chains.map((chain) => chain.find((e) => set.has(e)));
    if (records.some((r) => !r)) continue;
    const found = records as Element[];
    options.push({
      selector,
      count: matched.length,
      matched,
      records: found,
      item: norm($(found[0]).text()),
    });
  }
  // Field rules depend only on the records holding the examples, which many rules share.
  const ruled = new Map<string, Record<string, FoundRule | null>>();
  const ids = new Map<Element, number>();
  const idOf = (record: Element) => ids.get(record) ?? (ids.set(record, ids.size), ids.size - 1);
  const withFields = options
    .map((option) => {
      const key = option.records.map(idOf).join(',');
      const fields = ruled.get(key) ?? fieldRules($, option.records, examples);
      ruled.set(key, fields);
      return { ...option, fields };
    })
    .sort((a, b) => byStability(a.selector, b.selector) || b.count - a.count);
  return { options: withFields, examples };
};

// Values each record yields under the field rules.
export const extractRecord = (
  $: CheerioAPI,
  record: Element,
  fields: Record<string, FoundRule | null>,
  base: string,
): Record<string, (string | null)[] | null> =>
  Object.fromEntries(
    Object.entries(fields).map(([name, field]) => {
      if (!field) return [name, null];
      const values = hits($, record, field.selector).map((e) => {
        if (!field.attribute) return norm($(e).text());
        try {
          return new URL($(e).attr(field.attribute) ?? '', base).href;
        } catch {
          return null;
        }
      });
      return [name, values];
    }),
  );
