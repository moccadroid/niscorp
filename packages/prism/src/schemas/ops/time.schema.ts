import { z } from 'zod';

let _NodeSchema: z.ZodTypeAny = z.any();
export const setNodeSchema = (schema: z.ZodTypeAny): void => {
  _NodeSchema = schema;
};
const node = (): z.ZodTypeAny => _NodeSchema;

const TimeUnit = z
  .enum(['year', 'month', 'day', 'hour', 'minute', 'second'])
  .describe('Time unit for date arithmetic.');

export const DateNodeSchema = z
  .object({
    $date: z
      .object({
        value: z.lazy(node).describe('Date value (ISO string or timestamp).'),
        format: z.string().optional().describe('Output format string (dayjs format). Default: ISO 8601.'),
        utc: z.boolean().optional().default(false).describe('Format in UTC. Default: false.'),
      })
      .strict(),
  })
  .strict()
  .describe('Format a date value.');
export type DateNode = z.infer<typeof DateNodeSchema>;

export const DateAddNodeSchema = z
  .object({
    $dateAdd: z
      .object({
        date: z.lazy(node).describe('Base date (ISO string or timestamp).'),
        amount: z.number().describe('Amount to add (can be negative).'),
        unit: TimeUnit,
      })
      .strict(),
  })
  .strict()
  .describe('Add a duration to a date. Returns ISO string.');
export type DateAddNode = z.infer<typeof DateAddNodeSchema>;

export const DateDiffNodeSchema = z
  .object({
    $dateDiff: z
      .object({
        from: z.lazy(node).describe('Start date.'),
        to: z.lazy(node).describe('End date.'),
        unit: TimeUnit,
      })
      .strict(),
  })
  .strict()
  .describe('Calculate difference between two dates. Returns a number.');
export type DateDiffNode = z.infer<typeof DateDiffNodeSchema>;
