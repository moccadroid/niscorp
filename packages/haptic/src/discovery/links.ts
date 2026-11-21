import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { pickList } from './lists.js';
import type { Example } from './read.js';
import { candidates, fragility, hits, type ListOption } from './rules.js';
import type { Line } from './view.js';

export type LinkRule = {
  selector: string;
  link: { selector: string; attribute: string | null };
  urls: string[];
  options: number[];
};

// The task written for the linked pages is read on each of them, where the first page's line numbers mean nothing:
// code deletes references to them ("(lines 24, 27, and 30)", "at lines 22, 24 and 26").
export const withoutLineNumbers = (task: string | null) =>
  String(task ?? '')
    .replace(/\s*\([^)]*\blines?\s*\d[^)]*\)/gi, '')
    .replace(
      /\s*(?:\b(?:at|on|in|from)\s+)?\blines?\s+\d+(?:\s*(?:,|and|&|or|,\s*and)\s*\d+)*/gi,
      '',
    )
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

// The rule for the links Read cited: among the lists whose first `limit` links include every cited one (lists giving
// the same links are one option), the one nearest the limit, then the fewest.
export const linkRule = (
  $: CheerioAPI,
  follow: Line[],
  { limit, pageUrl, visited }: { limit: number; pageUrl: string; visited: string[] },
): LinkRule | { error: string } => {
  const examples: Example[] = follow.flatMap((line) =>
    line.linkElement
      ? [{ link: [{ element: line.linkElement, attribute: 'href', kind: 'link' as const }] }]
      : [],
  );
  const found = candidates($, examples);
  if ('error' in found) return { error: `link rule: ${found.error}` };
  if (!found.options.length) return { error: 'link rule: no candidates' };
  const abs = (href: string) => new URL(href, pageUrl).href.replace(/#.*$/, '');
  const urlsOf = (list: ListOption, n: number) => {
    const out: string[] = [];
    for (const record of list.matched) {
      const rule = list.fields.link;
      const first: Element | undefined = rule ? hits($, record, rule.selector)[0] : undefined;
      const href = first ? $(first).attr('href') : undefined;
      if (!href) continue;
      const u = abs(href);
      if (!out.includes(u) && !visited.includes(u)) out.push(u);
      if (out.length >= n) break;
    }
    return out;
  };
  const cited = follow.map((l) => abs(l.linkElement?.attribs.href ?? ''));
  const byUrls = new Map<string, ListOption>();
  for (const option of found.options
    .filter((o) => o.fields.link)
    .sort((a, b) => fragility(a.selector) - fragility(b.selector))) {
    const got = urlsOf(option, limit);
    if (cited.every((u) => got.includes(u)) && !byUrls.has(got.join(' ')))
      byUrls.set(got.join(' '), option);
  }
  const chosen = pickList([...byUrls.values()], limit);
  if (!chosen?.fields.link) return { error: 'no link rule leads to the cited pages first' };
  return {
    selector: chosen.selector,
    link: chosen.fields.link,
    urls: urlsOf(chosen, limit),
    options: [...byUrls.values()].map((l) => l.count),
  };
};
