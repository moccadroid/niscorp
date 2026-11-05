import { z } from 'zod';
import { defineOperation } from '../engine/operation.js';
import type { Operation } from '../engine/contracts.js';
import { HttpSourceSchema } from '../operations/http-source.js';
import {
  HtmlFieldsSchema,
  HtmlFieldError,
  HtmlSelectorError,
  readHtmlProfile,
} from '../readers/html/index.js';
import { createHtmlSelectionInspector, HtmlSelectionReportSchema } from './html-matches.js';
import {
  HtmlDiagnosticPolicySchema,
  HtmlMatchDiagnosticsSchema,
} from './html-match-diagnostics.js';
import { createHtmlAttributeClearing, HtmlContextPolicySchema } from './html-context.js';

export const AuthoringPolicySchema = z
  .object({
    minimumMatchesAcrossPages: z.number().int().nonnegative(),
    allowOverlappingResults: z.boolean(),
    fieldBounds: z
      .object({
        minimum: z.number().int().nonnegative(),
        maximum: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

const MeasureErrorSchema = z.union([
  z.object({ code: z.literal('HTML_SELECTOR'), message: z.string() }).strict(),
  z
    .object({
      code: z.literal('HTML_FIELD_MATCHES'),
      field: z.string(),
      selector: z.string(),
      closest: z.string().optional(),
      minimum: z.number().int().nonnegative(),
      maximum: z.number().int().nonnegative().nullable(),
      actual: z.number().int().nonnegative().nullable(),
      recordIndex: z.number().int().nonnegative().optional(),
    })
    .strict(),
]);
const PageMeasurementSchema = z
  .object({
    url: z.string(),
    report: HtmlSelectionReportSchema.nullable(),
    error: MeasureErrorSchema.nullable(),
    diagnostics: HtmlMatchDiagnosticsSchema.nullable(),
  })
  .strict();
export const HtmlMeasureOutputSchema = z
  .object({
    queries: z.array(
      z
        .object({
          id: z.string(),
          selector: z.string(),
          total: z.number().int().nonnegative().nullable(),
          pages: z.array(PageMeasurementSchema),
        })
        .strict(),
    ),
  })
  .strict();

/** Source observations only. Admission and repair are owned by the calling JSON flow. */
export const createHtmlMeasureOperation = (
  options: {
    html?: unknown;
    maxJsonDepth?: number;
  } = {},
): Operation => {
  const html = readHtmlProfile(options.html);
  return defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: z
      .object({
        sources: z.array(HttpSourceSchema),
        queries: z.array(
          z
            .object({
              id: z.string().min(1),
              selector: z.string().min(1),
              fields: HtmlFieldsSchema.nullable().optional(),
              anchors: z.array(z.string()),
            })
            .strict(),
        ),
        diagnostics: HtmlDiagnosticPolicySchema.nullable(),
        contextPolicy: HtmlContextPolicySchema.nullable(),
      })
      .strict(),
    output: HtmlMeasureOutputSchema,
    run(request, { signal }) {
      const clear =
        request.contextPolicy === null
          ? undefined
          : createHtmlAttributeClearing(request.contextPolicy);
      const sources = request.sources.map((source) => ({
        url: source.url,
        inspector: createHtmlSelectionInspector(source, request.diagnostics, signal, html, clear),
      }));
      return {
        queries: request.queries.map((query) => {
          const pages = sources.map(({ url, inspector }) => {
            signal.throwIfAborted();
            let report: z.infer<typeof HtmlSelectionReportSchema> | null = null;
            let error: z.infer<typeof MeasureErrorSchema> | null = null;
            let recordIndex: number | undefined;
            try {
              report = inspector.select(query.selector, query.fields);
            } catch (failure) {
              if (failure instanceof HtmlFieldError) {
                recordIndex = failure.recordIndex;
                error = {
                  code: 'HTML_FIELD_MATCHES',
                  field: failure.field,
                  selector: failure.selector,
                  ...(failure.closest === undefined ? {} : { closest: failure.closest }),
                  minimum: failure.minimum,
                  maximum: failure.maximum,
                  actual: failure.actual,
                  ...(recordIndex === undefined ? {} : { recordIndex }),
                };
              } else if (failure instanceof HtmlSelectorError)
                error = { code: 'HTML_SELECTOR', message: failure.message };
              else throw failure;
            }
            return {
              url,
              report,
              error,
              diagnostics:
                inspector.diagnose({
                  selector: query.selector,
                  anchors: query.anchors,
                  ...(recordIndex === undefined ? {} : { recordIndex }),
                }) ?? null,
            };
          });
          const total = pages.every((page) => page.report !== null)
            ? pages.reduce((count, page) => count + (page.report?.total ?? 0), 0)
            : null;
          return { id: query.id, selector: query.selector, total, pages };
        }),
      };
    },
  });
};
