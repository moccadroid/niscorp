import { z, type ZodType } from 'zod';
import { decodeJsonish, deepDecodeJsonish } from '@niscorp/signal';
import { flattenSchemaIssues } from '../utils/schema-issues';
import type { Envelope } from '../types';
import { trustUndefinedData } from '../utils/trust';

export type ResponseMode = 'required' | 'optional';

export type EnvelopeSpec<TData> = {
  schema?: ZodType<TData>;
  responseMode: ResponseMode;
};

const RESPONSE_DESCRIPTION = 'Human-facing text answer. Plain prose, no JSON.';
const REASONING_DESCRIPTION = 'Short model-authored note, written FIRST: what you are about to do and why. It comes before your answer, so use it to decide rather than to justify.';
const LOOSE_DATA_DESCRIPTION =
  'The final answer payload. MUST validate against the OUTPUT SCHEMA documented in the system prompt.';

// `.nullish()`, not `.optional()`: models write null for an absent field.
// Key order matters: a model writes the keys in the order they are declared, so
// `reasoning` comes first to be written before the answer it explains.
export const envelopeWireSchema = (spec: { schema?: ZodType; responseMode: ResponseMode }): ZodType => {
  const response = spec.responseMode === 'required'
    ? z.string().describe(RESPONSE_DESCRIPTION)
    : z.string().nullish().describe(RESPONSE_DESCRIPTION);
  if (spec.schema) {
    return z.object({
      reasoning: z.string().nullish().describe(REASONING_DESCRIPTION),
      response,
      data: spec.schema,
    });
  }
  return z.object({
    reasoning: z.string().nullish().describe(REASONING_DESCRIPTION),
    response,
  });
};

export const envelopeLooseWireSchema = (spec: { hasData: boolean; responseMode: ResponseMode }): ZodType => {
  const response = spec.responseMode === 'required'
    ? z.string().describe(RESPONSE_DESCRIPTION)
    : z.string().nullish().describe(RESPONSE_DESCRIPTION);
  if (spec.hasData) {
    return z.object({
      reasoning: z.string().nullish().describe(REASONING_DESCRIPTION),
      response,
      // Not z.unknown(): an empty {} schema tells the model no type, and it
      // sends the payload as a string.
      data: z
        .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
        .describe(LOOSE_DATA_DESCRIPTION),
    });
  }
  return z.object({
    reasoning: z.string().nullish().describe(REASONING_DESCRIPTION),
    response,
  });
};

// Any JSON container passes: for signal's router the gate only tells an attempt
// from garbage. validateEnvelope is the one judge of what the envelope holds.
export const envelopeAcceptSchema = (_spec: { schema?: ZodType; responseMode: ResponseMode }): ZodType =>
  z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

export type EnvelopeVerdict<TData> =
  | { ok: true; envelope: Envelope<TData> }
  | { ok: false; issues: string };

const KNOWN_KEYS = new Set(['response', 'data', 'reasoning']);

const decodeData = decodeJsonish;

// Models often send the bare payload, without the envelope around it.
const tryUnwrap = <TData>(record: Record<string, unknown>, spec: EnvelopeSpec<TData>): Envelope<TData> | undefined => {
  if (!spec.schema || spec.responseMode === 'required') return undefined;
  const keys = Object.keys(record);
  const looksWrapped = keys.length > 0 && keys.every((key) => KNOWN_KEYS.has(key));
  if (looksWrapped) return undefined;
  const parsed = spec.schema.safeParse(record);
  if (!parsed.success) return undefined;
  return { data: parsed.data };
};

export const validateEnvelope = <TData>(raw: unknown, spec: EnvelopeSpec<TData>): EnvelopeVerdict<TData> => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: 'envelope must be a JSON object with { response?, data?, reasoning? }' };
  }
  const record: Record<string, unknown> = { ...raw };
  const issues: string[] = [];

  for (const key of Object.keys(record)) {
    if (!KNOWN_KEYS.has(key)) issues.push(`unknown key "${key}" — only response, data, reasoning are allowed`);
  }
  if (issues.length > 0) {
    const unwrapped = tryUnwrap(record, spec);
    if (unwrapped !== undefined) return { ok: true, envelope: unwrapped };
  }

  const response = record['response'] ?? undefined;
  if (spec.responseMode === 'required' && typeof response !== 'string') {
    issues.push('response: required — a plain-text string answer');
  } else if (response !== undefined && typeof response !== 'string') {
    issues.push('response: must be a string');
  }

  const reasoning = record['reasoning'] ?? undefined;
  if (reasoning !== undefined && typeof reasoning !== 'string') {
    issues.push('reasoning: must be a string');
  }

  if (spec.schema) {
    const data = decodeData(record['data']);
    let parsed = spec.schema.safeParse(data);
    if (!parsed.success) {
      // Some providers stringify nested values inside the payload.
      const repaired = spec.schema.safeParse(deepDecodeJsonish(data));
      if (repaired.success) parsed = repaired;
    }
    if (!parsed.success) {
      for (const issue of flattenSchemaIssues(parsed.error.issues)) {
        const path = issue.path.length > 0 ? `data.${issue.path.join('.')}` : 'data';
        issues.push(`${path}: ${issue.message}`);
      }
      if (typeof data === 'string') {
        issues.push('data arrived as ONE STRING — pass the payload as a plain JSON value, not a quoted string');
      }
    }
    if (issues.length > 0) return { ok: false, issues: issues.join('; ') };
    if (!parsed.success) return { ok: false, issues: 'data failed schema validation' };
    const envelope: Envelope<TData> = {
      ...(typeof response === 'string' && { response }),
      data: parsed.data,
      ...(typeof reasoning === 'string' && { reasoning }),
    };
    return { ok: true, envelope };
  }

  if ((record['data'] ?? undefined) !== undefined) {
    issues.push('data: unexpected — this agent returns no data payload');
  }
  if (issues.length > 0) return { ok: false, issues: issues.join('; ') };
  const envelope: Envelope<TData> = {
    ...(typeof response === 'string' && { response }),
    data: trustUndefinedData<TData>(),
    ...(typeof reasoning === 'string' && { reasoning }),
  };
  return { ok: true, envelope };
};
