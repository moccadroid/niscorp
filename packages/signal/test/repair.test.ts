import { describe, it, expect } from 'vitest';
import {
  extractJson,
  repairEscapeDamage,
  decodeJsonish,
  deepDecodeJsonish,
  closeTruncated,
  isTruncatedJson,
} from '../src/wire/repair';

// Fixtures are real pathologies: Groq gpt-oss failed_generation bodies
// (truncated mid-structure), stringified nested arrays inside tool
// args, fenced/prose-wrapped output, GLM escape damage, 4o JSONL-ish
// noise. The mechanisms are rescue-only: callers validate candidates;
// these tests pin the MECHANICS.

// A truncated Groq failed_generation, shaped like the 2026-07-12 trace:
// the model's complete-ish action cut mid-string inside nested arrays.
const TRUNCATED_ACTION =
  '{"id":"view.tasks-command-center","name":"Overdue Tasks Command Center",' +
  '"title":"{{$.overdueCount}} overdue open tasks",' +
  '"layout":{"component":"Stack","props":{"gap":2},"children":[' +
  '{"component":"Stack","props":{"gap":1,"align":"cen';

// The raw recovery shape: the WHOLE tool-call object, truncated.
const TRUNCATED_CALL =
  '{"name": "json", "arguments": {\n  "id": "task-center",\n  "name": "Task Command Center",\n  "data": {\n    "overdueCount": 0,\n    "openTasks": [],\n    "loadingO';

describe('extractJson', () => {
  it('parses clean JSON directly', () => {
    expect(extractJson('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('[1, 2]')).toEqual({ ok: true, value: [1, 2] });
  });

  it('strips markdown fences', () => {
    const fenced = '```json\n{"a": 1}\n```';
    expect(extractJson(fenced)).toEqual({ ok: true, value: { a: 1 } });
  });

  it('finds the value inside surrounding prose', () => {
    const prose = 'Here is the result:\n{"a": 1, "b": [2]}\nHope that helps!';
    expect(extractJson(prose)).toEqual({ ok: true, value: { a: 1, b: [2] } });
  });

  it('survives invisible characters (BOM, zero-width)', () => {
    const dirty = '﻿{"a":​ 1}⁠';
    expect(extractJson(dirty)).toEqual({ ok: true, value: { a: 1 } });
  });

  it('extracts a bare array wrapped in prose', () => {
    expect(extractJson('rows: [1,2,3] as requested')).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('fails on prose with no JSON, and on truncated JSON', () => {
    expect(extractJson('no json here').ok).toBe(false);
    expect(extractJson(TRUNCATED_ACTION).ok).toBe(false);
  });
});

describe('repairEscapeDamage', () => {
  it('offers the invalid-quote-escape repair', () => {
    const damaged = '{"note": "it\\\'s fine"}';
    const candidates = repairEscapeDamage(damaged);
    expect(candidates.some((c) => JSON.parse(c).note === "it's fine")).toBe(true);
  });

  it('offers the strip-one-escape-layer repair', () => {
    const layered = '{\\"a\\": 1}';
    const candidates = repairEscapeDamage(layered);
    expect(candidates.some((c) => {
      try {
        return JSON.parse(c).a === 1;
      } catch {
        return false;
      }
    })).toBe(true);
  });

  it('returns nothing for undamaged text', () => {
    expect(repairEscapeDamage('{"a": 1}')).toEqual([]);
  });
});

describe('decodeJsonish', () => {
  it('decodes a stringified payload', () => {
    expect(decodeJsonish('{"answer": 7}')).toEqual({ answer: 7 });
  });

  it('leaves prose and non-strings alone', () => {
    expect(decodeJsonish('[draft] quarterly report')).toBe('[draft] quarterly report');
    expect(decodeJsonish(42)).toBe(42);
  });
});

describe('deepDecodeJsonish', () => {
  it('rescues the observed Groq corruption: nested arrays as ONE STRING', () => {
    const mangled = { component: 'Stack', children: '[{"component":"Text"}]' };
    expect(deepDecodeJsonish(mangled)).toEqual({ component: 'Stack', children: [{ component: 'Text' }] });
  });

  it('recurses into decoded layers', () => {
    const doubly = { layout: '{"do": "{\\"component\\": \\"Text\\"}"}' };
    expect(deepDecodeJsonish(doubly)).toEqual({ layout: { do: { component: 'Text' } } });
  });
});

describe('closeTruncated', () => {
  it('closes the trace fixture, dropping the torn tail — never clipping content', () => {
    const closed = closeTruncated(TRUNCATED_ACTION);
    expect(closed).toBeDefined();
    const value = JSON.parse(closed as string) as {
      id: string;
      layout: { children: Array<{ props: Record<string, unknown> }> };
    };
    expect(value.id).toBe('view.tasks-command-center');
    // The complete parts survive; the torn `"align": "cen` is DROPPED,
    // not patched into a clipped string.
    expect(value.layout.children[0]?.props).toEqual({ gap: 1 });
    expect(JSON.stringify(value)).not.toContain('align');
  });

  it('closes the raw tool-call recovery shape', () => {
    const closed = closeTruncated(TRUNCATED_CALL);
    expect(closed).toBeDefined();
    const value = JSON.parse(closed as string) as { name: string; arguments: { data: Record<string, unknown> } };
    expect(value.name).toBe('json');
    expect(value.arguments.data['overdueCount']).toBe(0);
    // The torn "loadingO key is gone.
    expect('loadingO' in value.arguments.data).toBe(false);
  });

  it('drops a dangling key with no value', () => {
    expect(JSON.parse(closeTruncated('{"a": 1, "b":') as string)).toEqual({ a: 1 });
    expect(JSON.parse(closeTruncated('{"a": 1, "b"') as string)).toEqual({ a: 1 });
  });

  it('closes arrays cut after a complete element', () => {
    expect(JSON.parse(closeTruncated('[1, 2,') as string)).toEqual([1, 2]);
    expect(JSON.parse(closeTruncated('{"rows": [true, fal') as string)).toEqual({ rows: [true] });
  });

  it('keeps a complete trailing literal at EOF', () => {
    expect(JSON.parse(closeTruncated('{"a": [1, 2') as string)).toEqual({ a: [1, 2] });
  });

  it('returns undefined for complete JSON, non-JSON, and hopeless cuts', () => {
    expect(closeTruncated('{"a": 1}')).toBeUndefined();
    expect(closeTruncated('plain prose')).toBeUndefined();
    // No complete value anywhere — nothing honest to close to.
    expect(closeTruncated('{"a": {"b": {"c":')).toBeUndefined();
  });
});

describe('isTruncatedJson', () => {
  it('detects the trace fixtures as truncated', () => {
    expect(isTruncatedJson(TRUNCATED_ACTION)).toBe(true);
    expect(isTruncatedJson(TRUNCATED_CALL)).toBe(true);
  });

  it('is false for complete JSON and for prose', () => {
    expect(isTruncatedJson('{"a": 1}')).toBe(false);
    expect(isTruncatedJson('just words')).toBe(false);
    // Invalid but BALANCED json is not "truncated".
    expect(isTruncatedJson('{"a" 1}')).toBe(false);
  });
});
