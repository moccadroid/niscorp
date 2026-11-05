import { load } from 'cheerio';
import {
  hasChildren,
  isComment,
  isDirective,
  isDocument,
  isTag,
  isText,
  type AnyNode,
} from 'domhandler';
import { z } from 'zod';
import type { Operation } from '../engine/contracts.js';
import { defineOperation } from '../engine/operation.js';
import { createHtmlStructure, readHtmlProfile } from '../readers/html/index.js';
import { HtmlDocumentSchema } from './html-inspection.js';

export const HtmlContextPolicySchema = z
  .object({
    representation: z.literal('parsed-html'),
    clearTextIn: z.array(z.string().min(1)),
    clearAttributeValues: z.array(z.string().min(1)),
    clearAttributeNamePrefixes: z.array(z.string().min(1)),
    clearAttributeValuePrefixes: z.array(z.string().min(1)),
    clearContentsOf: z
      .array(z.string().min(1))
      .optional()
      .describe(
        'CSS selectors whose matched elements keep their attributes but lose all children in model context only.',
      ),
  })
  .strict();

const CountsSchema = z
  .object({ values: z.number().int().nonnegative(), bytes: z.number().int().nonnegative() })
  .strict();

export const createHtmlAttributeClearing = (
  policy: z.infer<typeof HtmlContextPolicySchema>,
): ((name: string, value: string) => boolean) => {
  const attributes = new Set(policy.clearAttributeValues.map((value) => value.toLowerCase()));
  const namePrefixes = policy.clearAttributeNamePrefixes.map((value) => value.toLowerCase());
  const valuePrefixes = policy.clearAttributeValuePrefixes.map((value) => value.toLowerCase());
  return (name, value) =>
    Boolean(
      value &&
        (attributes.has(name.toLowerCase()) ||
          namePrefixes.some((prefix) => name.toLowerCase().startsWith(prefix)) ||
          valuePrefixes.some((prefix) => value.trimStart().toLowerCase().startsWith(prefix))),
    );
};
export const HtmlContextReportSchema = z
  .object({
    url: z.url(),
    sourceSha256: HtmlDocumentSchema.shape.sha256,
    policy: HtmlContextPolicySchema,
    inputHtmlBytes: z.number().int().nonnegative(),
    outputHtmlBytes: z.number().int().nonnegative(),
    clearedText: CountsSchema,
    clearedAttributes: CountsSchema,
    clearedContents: CountsSchema,
  })
  .strict();

export const HtmlContextOutputSchema = z
  .object({
    url: z.url(),
    sourceSha256: HtmlDocumentSchema.shape.sha256,
    html: z.string(),
    report: HtmlContextReportSchema,
  })
  .strict();

// Some malformed trees cannot be represented faithfully as a new HTML document.
const sameParsedTree = (before: AnyNode, after: AnyNode, signal: AbortSignal): boolean => {
  const pairs = [{ before, after }];
  const sameValues = (
    left: Record<string, string> = {},
    right: Record<string, string> = {},
  ): boolean =>
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([name, value]) => right[name] === value);
  const children = (node: AnyNode): AnyNode[] =>
    hasChildren(node)
      ? node.children.filter((child) => !isText(child) || child.data.length > 0)
      : [];
  while (pairs.length) {
    signal.throwIfAborted();
    const pair = pairs.pop();
    if (!pair) break;
    const left = pair.before,
      right = pair.after;
    if (left.type !== right.type) return false;
    if (isDocument(left) && (!isDocument(right) || left['x-mode'] !== right['x-mode']))
      return false;
    if (
      isDirective(left) &&
      (!isDirective(right) ||
        left['x-name'] !== right['x-name'] ||
        left['x-publicId'] !== right['x-publicId'] ||
        left['x-systemId'] !== right['x-systemId'])
    )
      return false;
    if (isTag(left)) {
      if (
        !isTag(right) ||
        left.name !== right.name ||
        left.namespace !== right.namespace ||
        !sameValues(left.attribs, right.attribs) ||
        !sameValues(left['x-attribsPrefix'], right['x-attribsPrefix']) ||
        !sameValues(left['x-attribsNamespace'], right['x-attribsNamespace'])
      )
        return false;
    } else if (isText(left) || isComment(left)) {
      if (!(isText(right) || isComment(right)) || left.data !== right.data) return false;
    }
    const leftChildren = children(left),
      rightChildren = children(right);
    if (leftChildren.length !== rightChildren.length) return false;
    for (const [index, child] of leftChildren.entries()) {
      const other = rightChildren[index];
      if (!other) return false;
      pairs.push({ before: child, after: other });
    }
  }
  return true;
};

/** Discovery context only. Serialize parsed HTML with configured payloads cleared. */
export const createHtmlContextOperation = (
  input: {
    html?: unknown;
    maxJsonDepth?: number;
  } = {},
): Operation => {
  const profile = readHtmlProfile(input.html);
  const { maxInputBytes: _maxInputBytes, ...limits } = profile.limits;
  return defineOperation({
    maxJsonDepth: input.maxJsonDepth,
    input: z.object({ document: HtmlDocumentSchema, policy: HtmlContextPolicySchema }).strict(),
    output: HtmlContextOutputSchema,
    run({ document, policy }, { signal }) {
      // Reuse the reader's resource-checked private tree for clearing and serialization.
      const structure = createHtmlStructure(document.html, limits, signal);
      const root = structure.root;
      const tags = new Set(policy.clearTextIn.map((value) => value.toLowerCase()));
      const clearAttribute = createHtmlAttributeClearing(policy);
      const contentsToClear = new Set(
        (policy.clearContentsOf ?? []).flatMap((selector) => structure.query(selector)),
      );
      const clearedText = { values: 0, bytes: 0 };
      const clearedAttributes = { values: 0, bytes: 0 };
      const clearedContents = { values: 0, bytes: 0 };
      const stack: { node: AnyNode; clearText: boolean }[] = [{ node: root, clearText: false }];
      while (stack.length) {
        signal.throwIfAborted();
        const next = stack.pop();
        if (!next) break;
        const { node } = next;
        const clearText = next.clearText || (isTag(node) && tags.has(node.name.toLowerCase()));
        if ((isText(node) || isComment(node)) && clearText && node.data.length) {
          clearedText.values++;
          clearedText.bytes += Buffer.byteLength(node.data);
          node.data = '';
        }
        if (isTag(node)) {
          for (const [name, value] of Object.entries(node.attribs)) {
            signal.throwIfAborted();
            if (clearAttribute(name, value)) {
              clearedAttributes.values++;
              clearedAttributes.bytes += Buffer.byteLength(value);
              node.attribs[name] = '';
            }
          }
          if (contentsToClear.has(node) && node.children.length > 0) {
            const beforeBytes = Buffer.byteLength(structure.htmlOf(node));
            for (const child of node.children) {
              signal.throwIfAborted();
              child.parent = null;
              child.prev = null;
              child.next = null;
            }
            node.children = [];
            clearedContents.values++;
            clearedContents.bytes += beforeBytes - Buffer.byteLength(structure.htmlOf(node));
          }
        }
        if (hasChildren(node)) {
          for (const child of node.children) stack.push({ node: child, clearText });
        }
      }
      signal.throwIfAborted();
      const html = structure.htmlOf();
      const outputHtmlBytes = Buffer.byteLength(html);
      if (outputHtmlBytes > limits.maxIndexBytes)
        throw new Error('HTML_CONTEXT_OUTPUT_BYTE_BUDGET');
      const reparsed = load(html).root().get(0);
      if (!reparsed || !sameParsedTree(root, reparsed, signal))
        throw new Error(
          'HTML_CONTEXT_STRUCTURE_CHANGED: prepared HTML cannot retain the parsed structure',
        );
      signal.throwIfAborted();
      return {
        url: document.url,
        sourceSha256: document.sha256,
        html,
        report: {
          url: document.url,
          sourceSha256: document.sha256,
          policy,
          inputHtmlBytes: Buffer.byteLength(document.html),
          outputHtmlBytes,
          clearedText,
          clearedAttributes,
          clearedContents,
        },
      };
    },
  });
};
