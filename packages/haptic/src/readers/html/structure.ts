import { load } from 'cheerio';
import { hasChildren, isDirective, isDocument, isTag, isText } from 'domhandler';
import type { AnyNode, Element } from 'domhandler';
import { selectAll } from 'css-select';
import * as dom from 'domutils';
import { z } from 'zod';
import { compileClosestLocator, validateLocator } from './locator.js';
import { spreadMergedCells } from './cells.js';
import profile from './default-profile.json' with { type: 'json' };
export const HtmlStructureLimitsSchema = z
  .object({
    maxElements: z.number().int().positive().default(profile.limits.maxElements),
    maxNodes: z.number().int().positive().default(profile.limits.maxNodes),
    maxDepth: z.number().int().positive().default(profile.limits.maxDepth),
    maxFieldValues: z.number().int().positive().default(profile.limits.maxFieldValues),
    maxFieldBytes: z.number().int().positive().default(profile.limits.maxFieldBytes),
    maxIndexBytes: z
      .number()
      .int()
      .positive()
      .default(profile.limits.maxIndexBytes)
      .describe(
        'Source byte cap and separate logical index allowance: 128 units per node plus visible UTF-8 text bytes. Not a process RSS limit.',
      ),
  })
  .strict();
export type HtmlStructureLimits = z.infer<typeof HtmlStructureLimitsSchema>;
type Entry = {
  parent: AnyNode | null;
  ordinal: number;
  hidden: boolean;
};
type Visit = Entry & {
  node: AnyNode;
  depth: number;
  inert: boolean;
};
type BaseFacts = {
  firstBase: {
    path: number[];
    href: string;
  } | null;
  policies: string[];
};
export interface HtmlStructure {
  readonly root: AnyNode;
  query(selector: string): Element[];
  closest(selector: string, record: Element): Element | null;
  queryWithin(selector: string, record: Element): Element[];
  textOf(node: Element): string;
  pathOf(node: AnyNode): number[];
  baseFacts(): BaseFacts;
  htmlOf(node?: Element): string;
}
const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const hiddenTags = new Set(['script', 'style', 'noscript', 'template']);
const quoteDoctypeIdentifier = (value: string): string => {
  const quote = value.includes('"') ? "'" : '"';
  if (value.includes(quote)) throw new Error('HTML_DOCTYPE_IDENTIFIER');
  return quote + value + quote;
};
export const createHtmlStructure = (
  content: string,
  inputLimits: Partial<HtmlStructureLimits> = {},
  signal?: AbortSignal,
): HtmlStructure => {
  signal?.throwIfAborted();
  const limits = HtmlStructureLimitsSchema.parse(inputLimits);
  if (Buffer.byteLength(content) > limits.maxIndexBytes) throw new Error('HTML_SOURCE_BYTE_BUDGET');
  const $ = load(content);
  spreadMergedCells($);
  const root = $.root().get(0);
  if (!root) throw new Error('HTML_DOCUMENT_ROOT_MISSING');
  const entries = new WeakMap<AnyNode, Entry>();
  const stack: Visit[] = [
    { node: root, parent: null, ordinal: 0, depth: 0, hidden: false, inert: false },
  ];
  let nodes = 0;
  let elements = 0;
  let indexBytes = 0;
  let firstBase: Element | undefined;
  const policies: string[] = [];
  while (stack.length) {
    signal?.throwIfAborted();
    const next = stack.pop();
    if (!next) break;
    const { node, parent, ordinal, depth } = next;
    if (++nodes > limits.maxNodes) throw new Error('HTML_STRUCTURE_NODE_BUDGET');
    if (depth > limits.maxDepth) throw new Error('HTML_STRUCTURE_DEPTH_BUDGET');
    const hidden = next.hidden || (isTag(node) && hiddenTags.has(node.name));
    const inert =
      next.inert || (isTag(node) && node.namespace === htmlNamespace && node.name === 'template');
    indexBytes += 128 + (isText(node) && !hidden ? Buffer.byteLength(node.data) : 0);
    if (indexBytes > limits.maxIndexBytes) throw new Error('HTML_STRUCTURE_INDEX_BYTE_BUDGET');
    entries.set(node, { parent, ordinal, hidden });
    if (isTag(node)) {
      if (++elements > limits.maxElements) throw new Error('HTML_STRUCTURE_ELEMENT_BUDGET');
      if (!inert && node.namespace === htmlNamespace) {
        if (!firstBase && node.name === 'base' && Object.hasOwn(node.attribs, 'href'))
          firstBase = node;
        if (
          !firstBase &&
          node.parent &&
          isTag(node.parent) &&
          node.parent.name === 'head' &&
          node.name === 'meta' &&
          node.attribs['http-equiv']?.toLowerCase() === 'content-security-policy'
        )
          policies.push(node.attribs['content'] ?? '');
      }
    }
    if (hasChildren(node)) {
      for (let index = node.children.length - 1; index >= 0; index--) {
        const child = node.children[index];
        if (child)
          stack.push({
            node: child,
            parent: node,
            ordinal: index,
            depth: depth + 1,
            hidden,
            inert,
          });
      }
    }
  }
  const entryOf = (node: AnyNode): Entry => {
    const entry = entries.get(node);
    if (!entry) throw new Error('HTML_INDEX_NODE_MISSING');
    return entry;
  };
  const pathOf = (node: AnyNode): number[] => {
    const path: number[] = [];
    let entry = entryOf(node);
    while (entry.parent) {
      signal?.throwIfAborted();
      path.push(entry.ordinal);
      entry = entryOf(entry.parent);
    }
    return path.reverse();
  };
  return {
    root,
    query(selector): Element[] {
      signal?.throwIfAborted();
      validateLocator(selector);
      return $.root().find(selector).toArray().filter(isTag);
    },
    closest(selector, record): Element | null {
      signal?.throwIfAborted();
      entryOf(record);
      const matches = compileClosestLocator(selector, record);
      let node: AnyNode | null = record;
      while (node) {
        signal?.throwIfAborted();
        if (isTag(node) && matches(node)) return node;
        node = node.parent;
      }
      return null;
    },
    queryWithin(selector, record): Element[] {
      signal?.throwIfAborted();
      entryOf(record);
      validateLocator(selector);
      // Give the selector engine a detached view without changing the source tree.
      return selectAll<AnyNode, Element>(selector, [record], {
        context: record,
        adapter: {
          ...dom,
          isTag,
          getParent: (node) => (node === record ? null : dom.getParent(node)),
          getSiblings: (node) => (node === record ? [record] : dom.getSiblings(node)),
          prevElementSibling: (node) => (node === record ? null : dom.prevElementSibling(node)),
        },
      });
    },
    textOf(node): string {
      const text: string[] = [];
      const remaining: AnyNode[] = [node];
      while (remaining.length) {
        signal?.throwIfAborted();
        const current = remaining.pop();
        if (!current || entryOf(current).hidden) continue;
        if (isText(current)) text.push(current.data);
        else if (hasChildren(current)) {
          for (let index = current.children.length - 1; index >= 0; index--) {
            const child = current.children[index];
            if (child) remaining.push(child);
          }
        }
      }
      return text.join('');
    },
    pathOf,
    htmlOf(node): string {
      signal?.throwIfAborted();
      if (node === undefined && hasChildren(root))
        return root.children
          .map((child) => {
            signal?.throwIfAborted();
            // The standard serializer drops these IDs, changing legacy parsing modes.
            if (isDirective(child) && child.name === '!doctype') {
              const name = child['x-name'] ?? 'html';
              const publicId = child['x-publicId'] ?? '';
              const systemId = child['x-systemId'] ?? '';
              const declaration =
                '<!DOCTYPE ' +
                name +
                (publicId
                  ? ' PUBLIC ' + quoteDoctypeIdentifier(publicId)
                  : systemId
                    ? ' SYSTEM'
                    : '') +
                (systemId ? ' ' + quoteDoctypeIdentifier(systemId) : '') +
                '>';
              // The DOM adapter conflates absent and explicitly empty system IDs.
              // Recover their semantic distinction from the parsed document mode.
              if (publicId && !systemId && isDocument(root)) {
                const parsed = load(declaration).root().get(0);
                if (parsed && isDocument(parsed) && parsed['x-mode'] !== root['x-mode'])
                  return declaration.slice(0, -1) + ' "">';
              }
              return declaration;
            }
            return $.html(child);
          })
          .join('');
      if (node === undefined) return $.html();
      entryOf(node);
      return $.html(node);
    },
    baseFacts(): BaseFacts {
      signal?.throwIfAborted();
      return {
        firstBase: firstBase
          ? { path: pathOf(firstBase), href: firstBase.attribs['href'] ?? '' }
          : null,
        policies: [...policies],
      };
    },
  };
};
