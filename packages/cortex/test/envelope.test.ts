import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateEnvelope } from '../src/schemas/envelope.schema';

const DataSchema = z.object({ answer: z.number() });

describe('validateEnvelope — with a data schema', () => {
  it('accepts a full envelope and types data through the schema', () => {
    const verdict = validateEnvelope(
      { response: 'done', data: { answer: 42 }, reasoning: 'math' },
      { schema: DataSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.envelope.data.answer).toBe(42);
      expect(verdict.envelope.response).toBe('done');
      expect(verdict.envelope.reasoning).toBe('math');
    }
  });

  it('accepts data-only envelopes when response is optional', () => {
    const verdict = validateEnvelope({ data: { answer: 1 } }, { schema: DataSchema, responseMode: 'optional' });
    expect(verdict.ok).toBe(true);
  });

  it('prefixes data schema issues with their path', () => {
    const verdict = validateEnvelope(
      { data: { answer: 'nope' } },
      { schema: DataSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.issues).toContain('data.answer');
  });

  it('treats null as absent for optional fields — models say null', () => {
    const verdict = validateEnvelope(
      { response: null, data: { answer: 3 }, reasoning: null },
      { schema: DataSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.envelope.response).toBeUndefined();
      expect(verdict.envelope.data.answer).toBe(3);
    }
  });

  it('a REQUIRED response still fails on null — that is a missing reply', () => {
    const verdict = validateEnvelope({ response: null }, { responseMode: 'required' });
    expect(verdict.ok).toBe(false);
  });

  it('data: null on a chat agent is absent, not "unexpected"', () => {
    const verdict = validateEnvelope({ response: 'hi', data: null }, { responseMode: 'required' });
    expect(verdict.ok).toBe(true);
  });

  it('decodes a stringified data payload (reasoning-model habit)', () => {
    const verdict = validateEnvelope(
      { data: '{"answer": 7}' },
      { schema: DataSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.envelope.data.answer).toBe(7);
  });

  it('repairs escape-damaged stringified data (invalid \\\' and doubled escapes)', () => {
    const invalidQuote = validateEnvelope(
      { data: '{"answer": 7, "note": "it\\\'s fine"}' },
      { schema: DataSchema.extend({ note: z.string() }), responseMode: 'optional' },
    );
    expect(invalidQuote.ok).toBe(true);

    const doubled = validateEnvelope(
      { data: '{\\"answer\\": 7}' },
      { schema: DataSchema, responseMode: 'optional' },
    );
    expect(doubled.ok).toBe(true);
    if (doubled.ok) expect(doubled.envelope.data.answer).toBe(7);
  });

  it('tells the model when data stays an undecodable string', () => {
    const verdict = validateEnvelope(
      { data: 'the answer is seven' },
      { schema: DataSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.issues).toContain('data arrived as ONE STRING');
  });

  it('rejects unknown envelope keys', () => {
    const verdict = validateEnvelope(
      { data: { answer: 1 }, meta: {} },
      { schema: DataSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.issues).toContain('unknown key "meta"');
  });

  it('rejects non-objects', () => {
    expect(validateEnvelope('[]', { schema: DataSchema, responseMode: 'optional' }).ok).toBe(false);
    expect(validateEnvelope([1], { schema: DataSchema, responseMode: 'optional' }).ok).toBe(false);
    expect(validateEnvelope(null, { schema: DataSchema, responseMode: 'optional' }).ok).toBe(false);
  });
});

describe('validateEnvelope — chat agents (no schema)', () => {
  it('requires response when responseMode is required', () => {
    const missing = validateEnvelope({ reasoning: 'hm' }, { responseMode: 'required' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues).toContain('response: required');

    const present = validateEnvelope({ response: 'hi' }, { responseMode: 'required' });
    expect(present.ok).toBe(true);
    if (present.ok) expect(present.envelope.data).toBeUndefined();
  });

  it('rejects a data payload the agent did not declare', () => {
    const verdict = validateEnvelope({ response: 'hi', data: { x: 1 } }, { responseMode: 'required' });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.issues).toContain('data: unexpected');
  });

  it('rejects non-string reasoning', () => {
    const verdict = validateEnvelope({ response: 'hi', reasoning: 5 }, { responseMode: 'required' });
    expect(verdict.ok).toBe(false);
  });
});

describe('validateEnvelope — deep repair (stringified NESTED values)', () => {
  const NodeSchema = z.object({
    component: z.string(),
    children: z.array(z.object({ component: z.string() })).optional(),
  });

  it('rescues the observed Groq corruption: a nested array arriving as ONE STRING', () => {
    const verdict = validateEnvelope(
      { data: { component: 'Stack', children: '[{"component":"Text"}]' } },
      { schema: NodeSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.envelope.data.children).toEqual([{ component: 'Text' }]);
  });

  it('rescues corruption at more than one depth in the same payload', () => {
    const DeepSchema = z.object({
      layout: z.object({ do: z.object({ component: z.string() }) }),
    });
    const verdict = validateEnvelope(
      { data: { layout: '{"do": "{\\"component\\": \\"Text\\"}"}' } },
      { schema: DeepSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.envelope.data.layout.do.component).toBe('Text');
  });

  it('reports the ORIGINAL issues when the deep repair does not validate either', () => {
    const verdict = validateEnvelope(
      { data: { component: 'Stack', children: 'not json at all' } },
      { schema: NodeSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.issues).toContain('data.children');
  });

  it('never rewrites prose strings that merely look bracketed', () => {
    const LabelSchema = z.object({ label: z.string() });
    const verdict = validateEnvelope(
      { data: { label: '[draft] quarterly report' } },
      { schema: LabelSchema, responseMode: 'optional' },
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.envelope.data.label).toBe('[draft] quarterly report');
  });
});
