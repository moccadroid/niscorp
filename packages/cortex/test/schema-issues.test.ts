import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { flattenSchemaIssues, type SchemaIssue } from '../src/utils/schema-issues';

const format = (schema: z.ZodType, value: unknown): string => {
  const parsed = schema.safeParse(value);
  if (parsed.success) throw new Error('fixture unexpectedly valid');
  return flattenSchemaIssues(parsed.error.issues as SchemaIssue[])
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
};

const Step = z.union([
  z.strictObject({ call: z.string() }),
  z.strictObject({ push: z.object({ action: z.string() }) }),
]);

describe('flattenSchemaIssues', () => {
  it('verb-keyed step unions name the branch the value used ({call:{...}} → call)', () => {
    const evidence = format(z.object({ steps: z.array(Step) }), { steps: [{ call: { call: 'load' } }] });
    expect(evidence).toContain('steps.0.call');
    expect(evidence).not.toContain('Unrecognized');
  });

  it('node-or-string unions never report "expected string" for an object node', () => {
    const Node = z.union([z.string(), z.strictObject({ component: z.string(), gap: z.number().optional() })]);
    const evidence = format(z.object({ layout: Node }), { layout: { component: 42 } });
    expect(evidence).toContain('layout.component');
    expect(evidence).not.toContain('expected string, received object');
  });

  it('a record key that breaks its rule reports the rule, not "Invalid key in record"', () => {
    const Scores = z.record(z.string().regex(/^[a-z]+$/, 'keys are lower-case letters'), z.number());
    expect(format(z.object({ scores: Scores }), { scores: { good: 1, Bad: 2 } })).toBe('scores.Bad: keys are lower-case letters');
  });

  it('nested union paths keep their prefixes', () => {
    const Inner = z.union([z.object({ a: z.number() }), z.object({ b: z.string() })]);
    const evidence = format(z.object({ data: z.object({ item: Inner }) }), { data: { item: { a: 'x' } } });
    expect(evidence).toContain('data.item.a');
  });
});
