export type ExtractResult = { ok: true; value: unknown } | { ok: false };

// BOM, zero-width space, non-joiner and joiner, word joiner.
const INVISIBLES = /[﻿​‌‍⁠]/g;

const tryParse = (text: string): ExtractResult => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

const spanCandidates = (text: string, open: string, close: string): string[] => {
  const first = text.indexOf(open);
  if (first < 0) return [];
  const candidates: string[] = [];
  for (let last = text.lastIndexOf(close); last > first; last = text.lastIndexOf(close, last - 1)) {
    candidates.push(text.slice(first, last + 1));
    if (candidates.length >= 8) break;
  }
  return candidates;
};

export const extractJson = (content: string): ExtractResult => {
  const cleaned = content.replace(INVISIBLES, '').trim();
  if (cleaned.length === 0) return { ok: false };

  const direct = tryParse(cleaned);
  if (direct.ok) return direct;

  const fence = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const body = fence?.[1] !== undefined ? fence[1].trim() : cleaned;
  if (body !== cleaned) {
    const fenced = tryParse(body);
    if (fenced.ok) return fenced;
  }

  for (const candidate of [...spanCandidates(body, '{', '}'), ...spanCandidates(body, '[', ']')]) {
    const parsed = tryParse(candidate);
    if (parsed.ok) return parsed;
  }
  return { ok: false };
};

export const repairEscapeDamage = (text: string): string[] => {
  const candidates: string[] = [];
  const noQuoteEscapes = text.replace(/\\'/g, "'");
  if (noQuoteEscapes !== text) candidates.push(noQuoteEscapes);
  const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (unescaped !== text) candidates.push(unescaped);
  return candidates;
};

export const decodeJsonish = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  const direct = tryParse(trimmed);
  if (direct.ok) return direct.value;
  for (const repaired of repairEscapeDamage(trimmed)) {
    const parsed = tryParse(repaired);
    if (parsed.ok) return parsed.value;
  }
  return value;
};

// Some models send a nested array or object inside tool-call arguments as a JSON string.
export const deepDecodeJsonish = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const decoded = decodeJsonish(value);
    return decoded === value ? value : deepDecodeJsonish(decoded);
  }
  if (Array.isArray(value)) return value.map(deepDecodeJsonish);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = deepDecodeJsonish(entry);
    return out;
  }
  return value;
};

// A boundary is a position where cutting the text and appending the closers of everything
// still open yields valid JSON: right after a completed value or a closed container.
type Frame = { type: 'obj' | 'arr'; expectingValue: boolean };

type Scan = {
  openAtEnd: number;
  boundary?: { end: number; closers: string };
};

const LITERAL_CHARS = /[0-9a-zA-Z.+\-]/;

const isCompleteLiteral = (buf: string): boolean => {
  if (buf === 'true' || buf === 'false' || buf === 'null') return true;
  return buf.length > 0 && !Number.isNaN(Number(buf));
};

const scan = (text: string): Scan | undefined => {
  const stack: Frame[] = [];
  let inString = false;
  let escape = false;
  let stringIsValue = false;
  let literal = '';
  let boundary: Scan['boundary'];
  let started = false;

  const closers = (): string =>
    [...stack].reverse().map((frame) => (frame.type === 'obj' ? '}' : ']')).join('');

  const markBoundary = (end: number): void => {
    boundary = { end, closers: closers() };
  };

  const valueDone = (end: number): void => {
    const top = stack[stack.length - 1];
    if (top) top.expectingValue = false;
    markBoundary(end);
  };

  const endLiteral = (end: number): void => {
    if (literal.length === 0) return;
    if (isCompleteLiteral(literal)) valueDone(end);
    literal = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        if (stringIsValue) valueDone(i + 1);
      }
      continue;
    }

    if (literal.length > 0 && !LITERAL_CHARS.test(ch)) endLiteral(i);

    switch (ch) {
      case '{': {
        started = true;
        stack.push({ type: 'obj', expectingValue: false });
        break;
      }
      case '[': {
        started = true;
        stack.push({ type: 'arr', expectingValue: true });
        break;
      }
      case '}':
      case ']': {
        if (stack.length === 0) return undefined;
        stack.pop();
        valueDone(i + 1);
        break;
      }
      case '"': {
        const top = stack[stack.length - 1];
        inString = true;
        escape = false;
        stringIsValue = top === undefined || top.type === 'arr' || top.expectingValue;
        break;
      }
      case ':': {
        const top = stack[stack.length - 1];
        if (top?.type === 'obj') top.expectingValue = true;
        break;
      }
      case ',':
        break;
      default: {
        if (LITERAL_CHARS.test(ch)) {
          started = true;
          literal += ch;
        }
        break;
      }
    }
  }
  if (!inString) endLiteral(text.length);
  if (!started) return undefined;
  return { openAtEnd: stack.length + (inString ? 1 : 0), ...(boundary && { boundary }) };
};

// The torn tail is dropped, not closed: a clipped string that validates would be invented
// data, and a missing member is something the caller's schema can catch.
export const closeTruncated = (content: string): string | undefined => {
  const cleaned = content.replace(INVISIBLES, '').trim();
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) return undefined;
  if (tryParse(cleaned).ok) return undefined;
  const result = scan(cleaned);
  if (!result?.boundary || result.openAtEnd === 0) return undefined;
  const candidate = cleaned.slice(0, result.boundary.end) + result.boundary.closers;
  return tryParse(candidate).ok ? candidate : undefined;
};

export const isTruncatedJson = (content: string): boolean => {
  const cleaned = content.replace(INVISIBLES, '').trim();
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) return false;
  if (tryParse(cleaned).ok) return false;
  return (scan(cleaned)?.openAtEnd ?? 0) > 0;
};
