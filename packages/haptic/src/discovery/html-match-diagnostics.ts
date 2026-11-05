import { Element, Text, isTag, isText } from 'domhandler';
import { getOuterHTML } from 'domutils';
import { z } from 'zod';
import type { HtmlStructure } from '../readers/html/structure.js';
import { HtmlSelectorError } from '../readers/html/locator.js';

const emptyReport = { representation: 'shallow-parsed-html', truncated: false, nodes: [] };
export const HtmlDiagnosticPolicySchema = z
  .object({
    maxBytes: z
      .number()
      .int()
      .min(Buffer.byteLength(JSON.stringify(emptyReport))),
    maxNodes: z.number().int().nonnegative(),
    ancestorDepth: z.number().int().nonnegative(),
    attributes: z.array(z.string().min(1)),
    attributePrefixes: z.array(z.string().min(1)),
  })
  .strict();
const ContextSchema = z
  .object({ path: z.array(z.number().int().nonnegative()), html: z.string() })
  .strict();
const WitnessSchema = ContextSchema.extend({
  selector: z.string(),
  recordIndex: z.number().int().nonnegative().optional(),
  ancestors: z.array(ContextSchema),
});
type Witness = z.infer<typeof WitnessSchema>;
export const HtmlMatchDiagnosticsSchema = z
  .object({
    representation: z.literal('shallow-parsed-html'),
    truncated: z.boolean(),
    nodes: z.array(WitnessSchema),
  })
  .strict();
export type HtmlMatchDiagnostics = z.infer<typeof HtmlMatchDiagnosticsSchema>;

// Structural outlines come from the same parsed document as the trial. Child
// contents are deliberately elided; scripts/styles and text payloads are not copied.
export const describeHtmlMatches = (
  structure: HtmlStructure,
  policy: z.infer<typeof HtmlDiagnosticPolicySchema>,
  request: { selector: string | null; recordIndex?: number; anchors: string[] },
  signal: AbortSignal,
  clearAttribute?: (name: string, value: string) => boolean,
): HtmlMatchDiagnostics => {
  signal.throwIfAborted();
  const report: HtmlMatchDiagnostics = {
    representation: 'shallow-parsed-html',
    truncated: false,
    nodes: [],
  };
  const attributes = (node: Element): Record<string, string> =>
    Object.fromEntries(
      Object.entries(node.attribs)
        .filter(
          ([name]) =>
            policy.attributes.includes(name) ||
            policy.attributePrefixes.some((prefix) => name.startsWith(prefix)),
        )
        .map(([name, value]) => [name, clearAttribute?.(name, value) ? '' : value]),
    );
  const outline = (node: Element): string =>
    getOuterHTML(
      new Element(
        node.name,
        attributes(node),
        node.children
          .filter((child) => isTag(child) || (isText(child) && child.data.trim().length > 0))
          .map((child) =>
            isTag(child)
              ? new Element(child.name, attributes(child), [new Text('…')])
              : new Text('…'),
          ),
      ),
    );
  const fits = (): boolean => Buffer.byteLength(JSON.stringify(report)) <= policy.maxBytes;
  const seen = new WeakSet<Element>();
  const observe = (node: Element, selector: string, recordIndex?: number): boolean => {
    signal.throwIfAborted();
    if (seen.has(node)) return true;
    seen.add(node);
    if (report.nodes.length >= policy.maxNodes) {
      report.truncated = true;
      return false;
    }
    const witness: Witness = {
      selector,
      path: structure.pathOf(node),
      html: outline(node),
      ancestors: [],
      ...(recordIndex === undefined ? {} : { recordIndex }),
    };
    report.nodes.push(witness);
    if (!fits()) {
      report.nodes.pop();
      report.truncated = true;
      return false;
    }
    let parent = node.parent;
    for (let depth = 0; parent && depth < policy.ancestorDepth; depth++, parent = parent.parent) {
      signal.throwIfAborted();
      if (!isTag(parent)) continue;
      witness.ancestors.push({ path: structure.pathOf(parent), html: outline(parent) });
      if (!fits()) {
        witness.ancestors.pop();
        report.truncated = true;
        return false;
      }
    }
    return true;
  };
  if (request.selector !== null && request.recordIndex !== undefined) {
    const node = structure.query(request.selector)[request.recordIndex];
    if (node && !observe(node, request.selector, request.recordIndex)) return report;
  }
  for (const selector of request.anchors) {
    let nodes;
    try {
      nodes = structure.query(selector);
    } catch (error) {
      if (!(error instanceof HtmlSelectorError)) throw error;
      continue;
    }
    for (const node of nodes) if (!observe(node, selector)) return report;
  }
  return report;
};
