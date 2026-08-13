import { z } from 'zod';
import { ContextRefSchema, ScopeRefSchema, FieldOrValueSchema } from './value.schema.js';
import type { ContextRef, ScopeRef, FieldOrValue } from './value.schema.js';

// EXISTS — "is there a row over there that points back at this one".
//
// It is the same `{ from, filter }` a query already is, and deliberately no
// more than that: no fields, no sort, no limit, nothing to select. EXISTS asks
// whether a row is there, so anything that shapes output would be noise the
// planner discards, and refusing it is what keeps this an operator rather than
// an invitation to nest arbitrary SQL.
//
// The CORRELATION needs no new vocabulary. A dotted string on either side of a
// comparison is already a field path, so pointing the inner table at the outer
// one is an ordinary `eq` between two columns:
//
//   { exists: { from: ['tasks'], filter: { eq: ['tasks.issue_id', 'issues.id'] } } }
//
// and `not` composes for NOT EXISTS. Whoever writes SQL writes this on the
// first try, which is the entire design goal.
export type ExistsQuery = {
  from: string[];
  filter?: Filter;
};

export type Filter =
  | { exists: ExistsQuery }
  | { eq: [FieldOrValue, FieldOrValue] }
  | { neq: [FieldOrValue, FieldOrValue] }
  | { gt: [FieldOrValue, FieldOrValue] }
  | { gte: [FieldOrValue, FieldOrValue] }
  | { lt: [FieldOrValue, FieldOrValue] }
  | { lte: [FieldOrValue, FieldOrValue] }
  | { in: [string, FieldOrValue[] | ContextRef | ScopeRef] }
  | { notIn: [string, FieldOrValue[] | ContextRef | ScopeRef] }
  | { like: [string, FieldOrValue] }
  | { ilike: [string, FieldOrValue] }
  | { isNull: string }
  | { isNotNull: string }
  | { and: Filter[] }
  | { or: Filter[] }
  | { not: Filter }
  | { semantic: { field: string; query: ContextRef | ScopeRef; minScore?: number } }
  | { fuzzy: { field: string; query: ContextRef | ScopeRef; maxDistance?: number } }
  | { optional: { key: string | string[]; then: Filter } };

const comparisonPair = z
  .tuple([FieldOrValueSchema, FieldOrValueSchema])
  .describe('[left, right] — both can be field paths, literals, or references');

const fieldString = z.string().describe('Field path in entity.field format');

const collectionTarget = z
  .union([
    z.array(FieldOrValueSchema).min(1).describe('Array of literal values or references'),
    ContextRefSchema,
    ScopeRefSchema,
  ])
  .describe('A set of values or a reference that resolves to an array');

const ExistsSchema: z.ZodType<ExistsQuery> = z.lazy(() =>
  z
    .object({
      from: z.array(z.string()).min(1).describe('Entities the subquery reads. Joined by foreign key like any other from.'),
      filter: FilterSchema.optional().describe('The correlation, and any extra condition. Reference the outer query by its own entity path: { eq: ["tasks.issue_id", "issues.id"] }.'),
    })
    .strict(),
);

export const FilterSchema: z.ZodType<Filter> = z.lazy(() =>
  z.union([
    z.object({ exists: ExistsSchema }).strict().describe('EXISTS: true when the subquery matches at least one row. Wrap in `not` for NOT EXISTS.'),
    z.object({ eq: comparisonPair }).strict().describe('Equals: tests equality between two values'),
    z.object({ neq: comparisonPair }).strict().describe('Not equals'),
    z.object({ gt: comparisonPair }).strict().describe('Greater than'),
    z.object({ gte: comparisonPair }).strict().describe('Greater than or equal'),
    z.object({ lt: comparisonPair }).strict().describe('Less than'),
    z.object({ lte: comparisonPair }).strict().describe('Less than or equal'),
    z.object({ in: z.tuple([fieldString, collectionTarget]) }).strict().describe('Field value is in a set'),
    z.object({ notIn: z.tuple([fieldString, collectionTarget]) }).strict().describe('Field value is not in a set'),
    z.object({ like: z.tuple([fieldString, FieldOrValueSchema]) }).strict().describe('Case-sensitive LIKE pattern match (use % as wildcard)'),
    z.object({ ilike: z.tuple([fieldString, FieldOrValueSchema]) }).strict().describe('Case-insensitive ILIKE pattern match (use % as wildcard)'),
    z.object({ isNull: fieldString }).strict().describe('Field value is NULL'),
    z.object({ isNotNull: fieldString }).strict().describe('Field value is NOT NULL'),
    z.object({ and: z.array(FilterSchema).min(2) }).strict().describe('Logical AND: all conditions must be true'),
    z.object({ or: z.array(FilterSchema).min(2) }).strict().describe('Logical OR: at least one condition must be true'),
    z.object({ not: FilterSchema }).strict().describe('Logical NOT: negates the condition'),
    z.object({
      semantic: z.object({
        field: z.string().describe('Vector column field path (entity.field)'),
        query: z.union([ContextRefSchema, ScopeRefSchema]).describe('Text to embed and compare'),
        minScore: z.number().min(0).max(1).optional().describe('Minimum cosine similarity (0–1)'),
      }).strict(),
    }).strict().describe('Semantic vector similarity search'),
    z.object({
      fuzzy: z.object({
        field: z.string().describe('String field path'),
        query: z.union([ContextRefSchema, ScopeRefSchema]).describe('Text to fuzzy-match'),
        maxDistance: z.number().int().nonnegative().optional().describe('Maximum Levenshtein edit distance'),
      }).strict(),
    }).strict().describe('Fuzzy string match'),
    z.object({
      optional: z.object({
        key: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])
          .describe('The context key this condition depends on, or EVERY key it depends on. A condition referencing two keys must name both — gating on one leaves the other conditionally required, which surfaces as an empty result rather than as a condition that did not apply.'),
        // BARE, never `.describe()`d. That call CLONES the schema, and zod
        // detects a recursive reference by instance identity — a clone is a
        // different instance, so `to-json-schema` stops seeing the cycle and
        // expands the filter union into itself until the stack goes. Every
        // other recursive slot here (`not`, `and`, `or`) uses it bare for the
        // same reason; the description belongs on the wrapper below.
        then: FilterSchema,
      }).strict(),
    }).strict().describe(
      'A condition the caller turns on by supplying context keys. When any named key is absent the condition is REMOVED from the query before it compiles — it does not match everything, it is not there. Absent means missing, undefined or null; "" is a value and keeps the condition. Direction follows position: under `and` supplying the key NARROWS, under `or` it WIDENS. Either way an absent key reads exactly as if the condition had never been written, and scope is injected afterwards regardless. Reads only: a mutation may not contain one, and neither may the inside of an `exists` (its correlation must be unconditional).',
    ),
  ]),
);
