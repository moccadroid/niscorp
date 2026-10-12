import { closeTruncated, isTruncatedJson } from '../repair';
import { SignalError } from '../../errors';
import type { Rejection } from '../../types';
import type { ErrorWireStrategy } from './index';

// Groq answers a tool call or a response_format that fails its own validation with a 400
// that carries the model's attempt in `error.failed_generation`, cut off at Groq's body cap.
const RECOVERABLE_CODES = new Set(['tool_use_failed', 'json_validate_failed']);

const prop = (obj: unknown, key: string): unknown =>
  obj !== null && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;

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
  // Groq sends some rejections with no attempt. Empty, not undefined: undefined would
  // rethrow the error, and this way the turn comes back as a typed failure.
  if (raw === undefined) return { argsText: '', truncated: false };

  try {
    const parsed: unknown = JSON.parse(raw);
    const call = asCallShape(parsed);
    if (call) return { name: call.name, ...(call.args !== undefined && { args: call.args }), argsText: call.argsText, truncated: false };
    return { args: parsed, argsText: raw, truncated: false };
  } catch {
    const truncated = isTruncatedJson(raw);
    const closed = closeTruncated(raw);
    if (closed !== undefined) {
      try {
        const call = asCallShape(JSON.parse(closed));
        if (call) return { name: call.name, ...(call.args !== undefined && { args: call.args }), argsText: call.argsText, truncated };
      } catch {}
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
