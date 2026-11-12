import { z } from 'zod';

export const FieldRuleSchema = z
  .object({
    selector: z
      .string()
      .min(1)
      .describe(
        'CSS within the record; ":scope" is the record itself; a selector list ("p, li") is allowed.',
      ),
    attribute: z
      .string()
      .min(1)
      .nullable()
      .describe(
        'null reads the text; a name reads that attribute ("href" values are resolved to absolute addresses).',
      ),
    list: z
      .literal(true)
      .optional()
      .describe('The field collects every match; without it the field is the first match.'),
    closest: z
      .string()
      .min(1)
      .optional()
      .describe(
        'CSS for the nearest element at or above the record that the selector runs in instead of the record.',
      ),
  })
  .strict();

export const WhereSchema = z
  .object({
    in: z.string().min(1).describe('A field name, or "text" for the record\'s whole text.'),
    contains: z
      .string()
      .min(1)
      .describe(
        'Kept when that value contains this phrase, both folded (case, whitespace, dashes, quotes).',
      ),
  })
  .strict();

const required = z
  .array(z.string().min(1))
  .describe('A record without a non-empty value for one of these fields is not an item.');
const limit = z.number().int().positive().nullable();
const ResourceRuleSchema = z
  .object({
    selector: z
      .string()
      .min(1)
      .describe('CSS over the whole page for the elements naming files to download.'),
    attribute: z
      .string()
      .min(1)
      .describe('The attribute holding the file address, e.g. "href" or "src".'),
  })
  .strict()
  .describe("Files this level's pages lead to; downloaded up to the policy's maxResources.");
const namespaces = z
  .record(z.string().min(1), z.string().min(1))
  .describe('XPath prefix to namespace URI; {} for XML without namespaces.');
const xpathFields = z
  .record(z.string().min(1), z.string().min(1))
  .describe('Field name to an XPath 1.0 expression relative to the record element.');
const references = z
  .unknown()
  .describe('A Prism program returning { links?: [address], resources?: [address] }.');

export const RecordStageSchema = z
  .object({
    kind: z.literal('records'),
    format: z.literal('html'),
    render: z.boolean().describe("Run the pages' own inline scripts before selecting."),
    selector: z.string().min(1).describe('CSS for one record.'),
    fields: z.record(z.string().min(1), FieldRuleSchema),
    required,
    where: WhereSchema.nullable(),
    limit: limit.describe('The first N records of each page, after required and where.'),
    resources: ResourceRuleSchema.optional(),
  })
  .strict();

export const LinkStageSchema = z
  .object({
    kind: z.literal('links'),
    format: z.literal('html'),
    render: z.boolean(),
    selector: z.string().min(1).describe('CSS for one link record.'),
    link: FieldRuleSchema.describe('The rule reading the link address within the record.'),
    limit: limit.describe('How many distinct, not yet visited addresses to follow.'),
    resources: ResourceRuleSchema.optional(),
  })
  .strict();

export const XmlRecordStageSchema = z
  .object({
    kind: z.literal('records'),
    format: z.literal('xml'),
    selector: z
      .string()
      .min(1)
      .describe('XPath 1.0 selecting the record elements in document order.'),
    namespaces,
    fields: xpathFields,
    required,
    where: WhereSchema.nullable(),
    limit,
  })
  .strict();

export const JsonRecordStageSchema = z
  .object({ kind: z.literal('records'), format: z.literal('json') })
  .strict()
  .describe("Each page's whole JSON document is one record: { sourceUrl, document }.");

export const XmlReferenceStageSchema = z
  .object({
    kind: z.literal('references'),
    format: z.literal('xml'),
    selector: z.string().min(1),
    namespaces,
    fields: xpathFields,
    references: references.describe(
      'A Prism program over { records } returning { links?, resources? }.',
    ),
    limit: limit.describe('How many distinct, not yet visited addresses to follow.'),
  })
  .strict();

export const JsonReferenceStageSchema = z
  .object({
    kind: z.literal('references'),
    format: z.literal('json'),
    references: references.describe(
      'A Prism program over { document } returning { links?, resources? }.',
    ),
    limit: limit.describe('How many distinct, not yet visited addresses to follow.'),
  })
  .strict();

export const StageSchema = z.union([
  RecordStageSchema,
  LinkStageSchema,
  XmlRecordStageSchema,
  JsonRecordStageSchema,
  XmlReferenceStageSchema,
  JsonReferenceStageSchema,
]);

export const PolicySchema = z
  .object({
    maxPages: z.number().int().positive(),
    maxRedirects: z.number().int().nonnegative(),
    stripFragments: z.boolean(),
    accept: z
      .object({
        statuses: z.array(z.number().int()).min(1),
        mediaTypes: z
          .array(z.string().min(1))
          .nullable()
          .optional()
          .describe('Accepted content types; absent or null accepts any.'),
      })
      .strict(),
    maxResources: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Files a run may download; absent means none.'),
  })
  .strict();

// Version 0 of the nisc.haptic grammar: link and reference stages lead to a final record stage; the program shapes
// its records.
export const ArtifactSchema = z
  .object({
    stamp: z
      .object({ 'nisc.haptic': z.literal(0), 'nisc.prism': z.number().int().nonnegative() })
      .strict(),
    policy: PolicySchema,
    stages: z
      .array(StageSchema)
      .min(1)
      .refine(
        (stages) =>
          stages.at(-1)?.kind === 'records' &&
          stages.slice(0, -1).every((stage) => stage.kind !== 'records'),
        {
          message: 'link or reference stages first, one record stage last',
        },
      ),
    mapping: z.unknown().describe('A Prism program over { records }.'),
    outputSchema: z
      .record(z.string(), z.unknown())
      .describe("JSON Schema of the program's result."),
  })
  .strict();

export type FieldRule = z.infer<typeof FieldRuleSchema>;
export type Where = z.infer<typeof WhereSchema>;
export type RecordStage = z.infer<typeof RecordStageSchema>;
export type LinkStage = z.infer<typeof LinkStageSchema>;
export type XmlRecordStage = z.infer<typeof XmlRecordStageSchema>;
export type JsonRecordStage = z.infer<typeof JsonRecordStageSchema>;
export type XmlReferenceStage = z.infer<typeof XmlReferenceStageSchema>;
export type JsonReferenceStage = z.infer<typeof JsonReferenceStageSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
