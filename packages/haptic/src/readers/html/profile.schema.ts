import { z } from 'zod';
import { freezeOwned, snapshotJson } from '../../engine/json.js';
import { HtmlStructureLimitsSchema } from './structure.js';
import preset from './default-profile.json' with { type: 'json' };
import engineProfile from '../../engine/default-profile.json' with { type: 'json' };
export const HtmlReaderProfileSchema = z
  .object({
    charset: z
      .object({
        prescanBytes: z
          .number()
          .int()
          .min(6)
          .describe(
            'Maximum initial byte count offered to the pinned encoding prescan; at least six bytes preserve BOM/XML-prefix detection.',
          ),
        fallbackEncoding: z
          .string()
          .min(1)
          .describe(
            'Explicit fallback label when BOM, transport and prescan identify no encoding.',
          ),
        errors: z
          .literal('fatal')
          .describe(
            'Reject malformed encoded text rather than substituting replacement characters.',
          ),
      })
      .strict(),
    base: z
      .object({
        urlEncoding: z
          .literal('utf-8')
          .describe('Use standard UTF8 URL parsing; refuse non-ASCII legacy-encoded queries.'),
      })
      .strict(),
    text: z
      .literal('native-text')
      .describe(
        'Native textOf excludes script/style/noscript/template; preserves remaining whitespace.',
      ),
    limits: HtmlStructureLimitsSchema.extend({
      maxElements: HtmlStructureLimitsSchema.shape.maxElements.removeDefault(),
      maxNodes: HtmlStructureLimitsSchema.shape.maxNodes.removeDefault(),
      maxDepth: HtmlStructureLimitsSchema.shape.maxDepth.removeDefault(),
      maxFieldValues: HtmlStructureLimitsSchema.shape.maxFieldValues.removeDefault(),
      maxFieldBytes: HtmlStructureLimitsSchema.shape.maxFieldBytes
        .removeDefault()
        .describe(
          'Total UTF-8 payload bytes of field names and extracted strings across selected records, before JSON escaping.',
        ),
      maxIndexBytes: HtmlStructureLimitsSchema.shape.maxIndexBytes.removeDefault(),
      maxInputBytes: z
        .number()
        .int()
        .positive()
        .describe('Maximum content-decoded bytes supplied to charset decoding.'),
    }).strict(),
  })
  .strict();
export type HtmlReaderProfile = z.infer<typeof HtmlReaderProfileSchema>;
const defaults = freezeOwned(HtmlReaderProfileSchema.parse(preset));
export const readHtmlProfile = (value: unknown = defaults): HtmlReaderProfile => {
  const profile = HtmlReaderProfileSchema.parse(snapshotJson(value, engineProfile.maxJsonDepth));
  new TextDecoder(profile.charset.fallbackEncoding, { fatal: true });
  return freezeOwned(profile);
};
