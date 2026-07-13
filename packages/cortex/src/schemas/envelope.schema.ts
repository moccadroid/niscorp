// ═══════════════════════════════════════════════════════════
// Envelope — wire schema + validation
// ═══════════════════════════════════════════════════════════
//
// The wire schema (a Zod object) exists ONLY for JSON-schema
// generation — it feeds signal's transport resolution (exit-tool
// params, response_format) and the schema docs. Validation is
// hand-rolled below so `data` flows through the agent's own schema
// and stays typed end-to-end — no envelope-level cast, no widening.

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
const REASONING_DESCRIPTION = 'Short model-authored note: WHY you did what you did.';
const LOOSE_DATA_DESCRIPTION =
  'The final answer payload. MUST validate against the OUTPUT SCHEMA documented in the system prompt.';

// ───────────────────────────────────────────────────────────
// Wire schema builders (for z.toJSONSchema only)
// ───────────────────────────────────────────────────────────

// Models say null: every optional model-facing field accepts null and
// treats it as absent (.nullish(), never bare .optional()). A required
// response stays strict — null there IS a missing reply.
export const envelopeWireSchema = (spec: { schema?: ZodType; responseMode: ResponseMode }): ZodType => {
  const response = spec.responseMode === 'required'
    ? z.string().describe(RESPONSE_DESCRIPTION)
    : z.string().nullish().describe(RESPONSE_DESCRIPTION);
  if (spec.schema) {
    return z.object({
      response,
      data: spec.schema,
      reasoning: z.string().nullish().describe(REASONING_DESCRIPTION),
    });
  }
  // Pure chat agents: no data key on the wire at all.
  return z.object({
    response,
    reasoning: z.string().nullish().describe(REASONING_DESCRIPTION),
  });
};

// Loose variant: `data` is opaque on the wire; the real schema is
// documented in the prompt and enforced by Zod on validation. This is
// what makes recursive DSL schemas (Prism nodes, Nova actions) work.
export const envelopeLooseWireSchema = (spec: { hasData: boolean; responseMode: ResponseMode }): ZodType => {
  const response = spec.responseMode === 'required'
    ? z.string().describe(RESPONSE_DESCRIPTION)
    : z.string().nullish().describe(RESPONSE_DESCRIPTION);
  if (spec.hasData) {
    return z.object({
      response,
      // A typed union, not z.unknown(): an empty {} schema gives the
      // model zero type signal and invites stringified payloads.
      data: z
        .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
        .describe(LOOSE_DATA_DESCRIPTION),
      reasoning: z.string().nullish().describe(REASONING_DESCRIPTION),
    });
  }
  return z.object({
    response,
    reasoning: z.string().nullish().describe(REASONING_DESCRIPTION),
  });
};

// The ACCEPTANCE gate — what signal's router gates candidates on. The
// gate is a TRANSPORT concern: its only job is telling a real attempt
// (a JSON container) from garbage so the repair ladder can pick a
// candidate. It carries NO envelope semantics — pushing semantics into
// the gate is how evidence archaeology crept into signal once already.
// validateEnvelope below is the ONE semantic judge; corrections quote
// its evidence.
export const envelopeAcceptSchema = (_spec: { schema?: ZodType; responseMode: ResponseMode }): ZodType =>
  z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

// ───────────────────────────────────────────────────────────
// Validation
// ───────────────────────────────────────────────────────────

export type EnvelopeVerdict<TData> =
  | { ok: true; envelope: Envelope<TData> }
  | { ok: false; issues: string };

const KNOWN_KEYS = new Set(['response', 'data', 'reasoning']);

// Reasoning models sometimes serialize the payload INTO a string
// ("data": "{\"id\": ...}"). When a data schema exists and data
// arrives as a JSON-looking string, decode (with escape repair)
// before validating — same defense as the loop's tool-args decode.
const decodeData = decodeJsonish;

// The "arrived UNWRAPPED" rung: models regularly emit the payload itself
// instead of the envelope around it — especially when the payload has its
// own `data`-named field (a Nova action) that collides with the envelope's.
// If the raw object is NOT a plausible envelope but validates cleanly
// against the data schema, it IS the answer, missing only its coat: accept
// it as { data: raw }. Envelope-first precedence; a strict, discriminating
// data schema is what makes this safe (loose record-ish schemas would
// wrongly swallow malformed envelopes — those agents keep the strict path
// because their unknown-keys check fails first only when keys overlap).
const tryUnwrap = <TData>(record: Record<string, unknown>, spec: EnvelopeSpec<TData>): Envelope<TData> | undefined => {
  if (!spec.schema || spec.responseMode === 'required') return undefined;
  // A plausible envelope (some known key, nothing unknown) is never unwrapped.
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

  // Models say null for "absent" — normalize before judging. A REQUIRED
  // response still fails on null: that is a missing reply.
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
      // Deep repair, one retry: the payload may carry stringified
      // NESTED values (Groq gpt-oss corrupts nested arrays in tool
      // args). Decode every JSON-looking string in the tree and
      // validate once more; when that also fails, report the ORIGINAL
      // issues — the repair is a rescue, never a source of error text.
      const repaired = spec.schema.safeParse(deepDecodeJsonish(data));
      if (repaired.success) parsed = repaired;
    }
    if (!parsed.success) {
      // Flattened union issues (see signal's formatter): corrections must
      // name the branch the value meant, not zod's "Invalid input".
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
