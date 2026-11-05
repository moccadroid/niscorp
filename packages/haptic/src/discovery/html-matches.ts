import { z } from 'zod';
import { HttpSourceSchema } from '../operations/http-source.js';
import { openHtml } from './html-inspection.js';
import {
  describeHtmlMatches,
  HtmlDiagnosticPolicySchema,
  type HtmlMatchDiagnostics,
} from './html-match-diagnostics.js';
import { readHtmlFields, readHtmlProfile, type HtmlFields } from '../readers/html/index.js';

export const HtmlSelectionReportSchema = z
  .object({
    total: z.number().int().nonnegative(),
    overlap: z
      .object({
        parentPath: z.array(z.number().int().nonnegative()),
        childPath: z.array(z.number().int().nonnegative()),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type HtmlSelectionReport = z.infer<typeof HtmlSelectionReportSchema>;

export const createHtmlSelectionInspector = (
  source: z.infer<typeof HttpSourceSchema>,
  diagnostics: z.infer<typeof HtmlDiagnosticPolicySchema> | null,
  signal: AbortSignal,
  profile?: unknown,
  clearAttribute?: (name: string, value: string) => boolean,
): {
  select: (selector: string, fields?: HtmlFields | null) => HtmlSelectionReport;
  diagnose: (request: {
    selector: string | null;
    recordIndex?: number;
    anchors: string[];
  }) => HtmlMatchDiagnostics | undefined;
} => {
  const policy = diagnostics === null ? null : HtmlDiagnosticPolicySchema.parse(diagnostics);
  const document = openHtml(source, signal, profile);
  const fieldLimits = readHtmlProfile(profile).limits;
  const select = (selector: string, fields?: HtmlFields | null): HtmlSelectionReport => {
    const nodes = document.structure.query(selector);
    if (fields != null)
      readHtmlFields(
        document.structure,
        nodes,
        fields,
        { maxValues: fieldLimits.maxFieldValues, maxBytes: fieldLimits.maxFieldBytes },
        signal,
      );
    const selected = new WeakSet<object>(nodes);
    let overlap: HtmlSelectionReport['overlap'] = null;
    for (const node of nodes) {
      signal.throwIfAborted();
      let ancestor = node.parent;
      while (ancestor) {
        signal.throwIfAborted();
        if (selected.has(ancestor)) {
          overlap = {
            parentPath: document.structure.pathOf(ancestor),
            childPath: document.structure.pathOf(node),
          };
          break;
        }
        ancestor = ancestor.parent;
      }
      if (overlap) break;
    }
    return { total: nodes.length, overlap };
  };
  return {
    select,
    diagnose: (request) =>
      policy === null
        ? undefined
        : describeHtmlMatches(document.structure, policy, request, signal, clearAttribute),
  };
};
