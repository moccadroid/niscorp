// ═══════════════════════════════════════════════════════════
// JSON wire repair — pure mechanisms over model-emitted bytes
// ═══════════════════════════════════════════════════════════
//
// "Models mangle JSON on the wire" is PROVIDER knowledge, so the
// mechanisms live in signal, next to the wire layer that composes
// them. Each does one thing, none validates against a schema, none
// knows a specific provider. Policy (which mechanism runs when, and
// whether a candidate is accepted) belongs to the caller; the house
// rule is rescue-only: a repaired candidate counts ONLY if it passes
// the caller's own validation, otherwise the original bytes and the
// original error stand. Mechanisms can therefore be aggressive
// without being able to invent truth.
//
//   extractJson        — find the JSON value buried in noise
//   repairEscapeDamage — candidate texts with common escape damage undone
//   decodeJsonish      — one string that should have been a value
//   deepDecodeJsonish  — stringified values anywhere in a tree
//   closeTruncated     — a cut-off container, closed at the last
//                        complete boundary (drops the torn tail —
//                        never fabricates clipped content)
//   isTruncatedJson    — does the text end mid-structure?

// ───────────────────────────────────────────────────────────
// extractJson — the JSON value buried in noise
// ───────────────────────────────────────────────────────────
//
// Handles, in order: clean JSON; invisible characters (BOM,
// zero-width); markdown fences; prose around the value (the longest
// {...} or [...] span that parses). Returns the PARSED value — parse
// success is what makes an extraction an extraction.

export type ExtractResult = { ok: true; value: unknown } | { ok: false };

// BOM, zero-width space/joiner/non-joiner, word joiner — characters
// models occasionally leak around JSON that break JSON.parse.
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
  // Longest span first, shrinking from the right: prose after the value
  // ("} — done!") is more common than braces inside trailing prose.
  for (let last = text.lastIndexOf(close); last > first; last = text.lastIndexOf(close, last - 1)) {
    candidates.push(text.slice(first, last + 1));
    if (candidates.length >= 8) break; // bounded — noise, not a search space
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

// ───────────────────────────────────────────────────────────
// repairEscapeDamage — common over-escaping, as candidate texts
// ───────────────────────────────────────────────────────────
//
// Reasoning models sometimes emit `\'` (not a legal JSON escape) or an
// extra escaping layer over the whole payload (`\"` where `"` was
// meant). Returns candidate TEXTS (only those that differ) — the
// caller parses and validates; this never parses.

export const repairEscapeDamage = (text: string): string[] => {
  const candidates: string[] = [];
  const noQuoteEscapes = text.replace(/\\'/g, "'");
  if (noQuoteEscapes !== text) candidates.push(noQuoteEscapes);
  const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (unescaped !== text) candidates.push(unescaped);
  return candidates;
};

// ───────────────────────────────────────────────────────────
// decodeJsonish — one string that should have been a value
// ───────────────────────────────────────────────────────────

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

// Deep variant: decode every JSON-looking string INSIDE a tree. The
// corruption this rescues (observed: Groq gpt-oss tool-call args)
// stringifies NESTED arrays/objects inside an otherwise well-formed
// payload ("children": "[{\"component\":..."). Strings that do not
// decode stay untouched; prose survives.

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

// ───────────────────────────────────────────────────────────
// Structural scan — shared by closeTruncated / isTruncatedJson
// ───────────────────────────────────────────────────────────
//
// One pass tracking the open-container stack, string/escape state and
// object phases (a closing quote ends a KEY or a VALUE — only values
// mark boundaries). A "boundary" is a position where cutting the text
// and appending the closers of everything still open yields valid
// JSON: right after a completed value or a closed container.

type Frame = { type: 'obj' | 'arr'; expectingValue: boolean };

type Scan = {
  // Open containers at end of text (empty = balanced).
  openAtEnd: number;
  // Last boundary: cut index (exclusive) + the closers to append.
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
        if (stack.length === 0) return undefined; // not JSON-shaped
        stack.pop();
        valueDone(i + 1);
        break;
      }
      case '"': {
        const top = stack[stack.length - 1];
        inString = true;
        escape = false;
        // In an object a string is a KEY unless a value is expected;
        // at root or in an array it is always a value.
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

// ───────────────────────────────────────────────────────────
// closeTruncated / isTruncatedJson
// ───────────────────────────────────────────────────────────
//
// closeTruncated cuts at the LAST complete boundary and appends the
// closers — the torn tail (a half-written key, a clipped string value)
// is DROPPED, never patched into plausible-looking content: a clipped
// string that validates would be fabricated data, a dropped member is
// an honest absence the caller's schema can catch.

export const closeTruncated = (content: string): string | undefined => {
  const cleaned = content.replace(INVISIBLES, '').trim();
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) return undefined;
  if (tryParse(cleaned).ok) return undefined; // nothing to close
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
