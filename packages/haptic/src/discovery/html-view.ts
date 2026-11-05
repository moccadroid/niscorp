import { z } from 'zod';
import { isTag, type Element } from 'domhandler';
import type { Operation } from '../engine/contracts.js';
import { defineOperation } from '../engine/operation.js';
import { OperationFailure } from '../engine/control.js';
import {
  createHtmlStructure,
  readHtmlProfile,
  HtmlFieldsSchema,
  readHtmlFields,
  HtmlSelectorError,
  HtmlFieldError,
} from '../readers/html/index.js';
import { SourceWindowSchema } from './source-author.js';
import { HtmlDocumentSchema } from './html-inspection.js';

export const HtmlViewInputSchema = z
  .object({
    document: z
      .object({
        url: HtmlDocumentSchema.shape.url,
        sourceSha256: HtmlDocumentSchema.shape.sha256.optional(),
        html: z.string(),
      })
      .strict(),
    selector: z.string().min(1),
    fields: HtmlFieldsSchema.nullable().optional(),
    window: SourceWindowSchema,
    maxBytes: z.number().int().positive(),
    omitNested: z
      .boolean()
      .optional()
      .describe(
        'Do not repeat matched descendants already present inside an included whole subtree.',
      ),
  })
  .strict();

export const HtmlViewOutputSchema = z
  .object({
    url: HtmlDocumentSchema.shape.url,
    sourceSha256: HtmlDocumentSchema.shape.sha256.optional(),
    selector: z.string(),
    total: z.number().int().nonnegative(),
    range: z
      .object({
        offset: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
        nextOffset: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    bytes: z.number().int().nonnegative(),
    covered: z.number().int().nonnegative(),
    items: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          path: z.array(z.number().int().nonnegative()),
          html: z.string(),
          bytes: z.number().int().nonnegative(),
          fields: z.record(z.string(), z.array(z.string().nullable())).optional(),
        })
        .strict(),
    ),
    omitted: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          path: z.array(z.number().int().nonnegative()),
          tag: z.string(),
          bytes: z.number().int().nonnegative(),
          reason: z.literal('byte-limit'),
        })
        .strict(),
    ),
  })
  .strict();

/** Read already prepared HTML. No transport or source-clearing policy lives here. */
export const createHtmlViewOperation = (
  input: { html?: unknown; maxJsonDepth?: number } = {},
): Operation => {
  const profile = readHtmlProfile(input.html);
  const { maxInputBytes: _maxInputBytes, ...limits } = profile.limits;
  return defineOperation({
    maxJsonDepth: input.maxJsonDepth,
    input: HtmlViewInputSchema,
    output: HtmlViewOutputSchema,
    run({ document, selector, fields, window, maxBytes, omitNested }, { signal }) {
      const structure = createHtmlStructure(document.html, limits, signal);
      const { matches, end, fieldValues } = (() => {
        try {
          const matches = structure.query(selector);
          const end = Math.min(matches.length, window.offset + window.limit);
          const fieldValues = fields
            ? readHtmlFields(
                structure,
                matches.slice(window.offset, end),
                fields,
                {
                  maxValues: profile.limits.maxFieldValues,
                  maxBytes: profile.limits.maxFieldBytes,
                },
                signal,
              )
            : null;
          return { matches, end, fieldValues };
        } catch (error) {
          if (error instanceof HtmlSelectorError)
            throw new OperationFailure('HTML_SELECTOR', error.message);
          if (error instanceof HtmlFieldError)
            throw new OperationFailure('HTML_FIELD_MATCHES', error.message);
          throw error;
        }
      })();
      const items: z.infer<typeof HtmlViewOutputSchema>['items'] = [];
      const omitted: z.infer<typeof HtmlViewOutputSchema>['omitted'] = [];
      let bytes = 0;
      let covered = 0;
      const included = new Set<Element>();
      let displayedEnd = end;
      const output = (): z.infer<typeof HtmlViewOutputSchema> => ({
        url: document.url,
        ...(document.sourceSha256 === undefined ? {} : { sourceSha256: document.sourceSha256 }),
        selector,
        total: matches.length,
        range: {
          offset: window.offset,
          end: Math.max(window.offset, displayedEnd),
          nextOffset: displayedEnd < matches.length ? displayedEnd : null,
        },
        bytes,
        covered,
        items,
        omitted,
      });
      // Reserve counter width so skipping covered descendants cannot overflow the view.
      const fits = (): boolean => {
        const candidate = { ...output(), covered: Math.max(0, end - window.offset) };
        return [null, matches.length].every(
          (nextOffset) =>
            Buffer.byteLength(
              JSON.stringify({ ...candidate, range: { ...candidate.range, nextOffset } }),
            ) <= maxBytes,
        );
      };
      if (!fits())
        throw new OperationFailure(
          'HTML_VIEW_OUTPUT_BYTES',
          'The HTML view metadata does not fit the configured display window.',
        );
      for (let index = window.offset; index < end; index++) {
        signal.throwIfAborted();
        const node = matches[index];
        if (!node) throw new Error('HTML_VIEW_MATCH_MISSING');
        if (omitNested) {
          let parent = node.parent;
          while (parent && !(isTag(parent) && included.has(parent))) parent = parent.parent;
          if (parent) {
            covered++;
            continue;
          }
        }
        const html = structure.htmlOf(node);
        const size = Buffer.byteLength(html);
        bytes += size;
        items.push({
          index,
          path: structure.pathOf(node),
          html,
          bytes: size,
          ...(fieldValues === null ? {} : { fields: fieldValues[index - window.offset] }),
        });
        if (!fits()) {
          items.pop();
          bytes -= size;
          omitted.push({
            index,
            path: structure.pathOf(node),
            tag: node.name,
            bytes: size,
            reason: 'byte-limit',
          });
          if (!fits()) {
            omitted.pop();
            if (index === window.offset)
              throw new OperationFailure(
                'HTML_VIEW_OUTPUT_BYTES',
                'The first omission cannot fit the configured display window.',
              );
            displayedEnd = index;
            break;
          }
        } else {
          included.add(node);
        }
      }
      return output();
    },
  });
};

export const InitialHtmlViewSchema = HtmlViewInputSchema.pick({
  selector: true,
  window: true,
  omitNested: true,
});
