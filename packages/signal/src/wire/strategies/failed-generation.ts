import { closeTruncated, isTruncatedJson } from '../repair';
import { SignalError } from '../../errors';
import type { Rejection } from '../../types';
import type { ErrorWireStrategy } from './index';

// Groq validates tool args / response_format SERVER-SIDE and 400s the
// whole request (tool_use_failed / json_validate_failed) with the
// model's attempt in `error.failed_generation`. Both observed shapes
// normalize here and ONLY here:
//   - parseable `{ name, arguments }` — the attempt was a call;
//   - truncated bytes (Groq caps the body) — close the structure to
//     recover the call shape, or hand the raw bytes to the ladder.

const RECOVERABLE_CODES = new Set(['tool_use_failed', 'json_validate_failed']);

const prop = (obj: unknown, key: string): unknown =>
  obj !== null && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;

// Adapters wrap provider errors in SignalError with the ORIGINAL error
// under context.raw — the strategy reads the original.
const unwrap = (error: unknown): unknown =>
  error instanceof SignalError ? (error.context?.['raw'] ?? error) : error;

const errorCode = (error: unknown): string | undefined => {
  const direct = prop(error, 'code');
  if (typeof direct === 'string') return direct;
  const nested = prop(prop(error, 'error'), 'code');
  return typeof nested === 'string' ? nested : undefined;
};

const failedGenerationOf = (error: unknown): string | undefined => {
  const gen = prop(prop(error, 'error'), 'failed_generation');
  return typeof gen === 'string' && gen.trim().length > 0 ? gen : undefined;
};

// When `arguments` is itself a string (double-encoded), args stays
// unset so the router's ladder runs over the text instead.
type CallShape = { name: string; args?: unknown; argsText: string };

const asCallShape = (value: unknown): CallShape | undefined => {
  const name = prop(value, 'name');
  if (typeof name !== 'string' || name.length === 0) return undefined;
  const args = prop(value, 'arguments');
  if (args === undefined) return undefined;
  if (typeof args === 'string') return { name, argsText: args };
  return { name, args, argsText: JSON.stringify(args) };
};

const recover = (error: unknown): Rejection | undefined => {
  const raw = failedGenerationOf(unwrap(error));
  // Not every rejection carries an attempt (gpt-oss commentary-channel
  // emissions rejected as unknown-tool calls, message only). The FACT
  // of the rejection is still worth a typed result.
  if (raw === undefined) return { argsText: '', truncated: false };

  try {
    const parsed: unknown = JSON.parse(raw);
    const call = asCallShape(parsed);
    if (call) return { name: call.name, ...(call.args !== undefined && { args: call.args }), argsText: call.argsText, truncated: false };
    // Parseable but not call-shaped: the attempt itself is the payload.
    return { args: parsed, argsText: raw, truncated: false };
  } catch {
    // Truncated or malformed. Closing the structure can recover the
    // call SHAPE — the torn tail is dropped, downstream schemas judge
    // what remains.
    const truncated = isTruncatedJson(raw);
    const closed = closeTruncated(raw);
    if (closed !== undefined) {
      try {
        const call = asCallShape(JSON.parse(closed));
        if (call) return { name: call.name, ...(call.args !== undefined && { args: call.args }), argsText: call.argsText, truncated };
      } catch {
        // fall through to raw bytes
      }
    }
    return { argsText: raw, truncated };
  }
};

export const failedGeneration: ErrorWireStrategy = {
  id: 'failed-generation',
  hook: 'error',
  matches: (error) => {
    const code = errorCode(unwrap(error));
    return code !== undefined && RECOVERABLE_CODES.has(code);
  },
  recover,
};
