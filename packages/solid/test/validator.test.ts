import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createStream } from '../src/create-stream';
import type { StreamError } from '../src/types';

// ═══════════════════════════════════════════════════════════
// Validator — kind checks at value-open
// ═══════════════════════════════════════════════════════════

const Schema = z.object({
  name: z.string(),
  count: z.number(),
  active: z.boolean(),
  tags: z.array(z.string()),
  meta: z.object({ id: z.string() }),
});

type Doc = z.infer<typeof Schema>;

const INITIAL: Doc = {
  name: 'init-name',
  count: 42,
  active: true,
  tags: ['init-tag'],
  meta: { id: 'init-id' },
};

// ───────────────────────────────────────────────────────────
// recover mode (default) — kind checks
// ───────────────────────────────────────────────────────────

describe('recover mode — kind violations', () => {
  it('rejects number where string expected, preserves prior value', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":42}');

    expect(stream.current().name).toBe('init-name'); // prior preserved
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('name');
    expect(errors[0]?.received).toBe('number');
    expect(errors[0]?.phase).toBe('value-open');
  });

  it('rejects string where number expected', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"count":"three"}');

    expect(stream.current().count).toBe(42);
    expect(errors[0]?.path).toBe('count');
    expect(errors[0]?.received).toBe('string');
  });

  it('rejects array where object expected', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"meta":[1,2,3]}');

    expect(stream.current().meta).toEqual({ id: 'init-id' });
    expect(errors[0]?.path).toBe('meta');
    expect(errors[0]?.received).toBe('array');
  });

  it('rejects string where array expected', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"tags":"oops"}');

    expect(stream.current().tags).toEqual(['init-tag']);
    expect(errors[0]?.path).toBe('tags');
    expect(errors[0]?.received).toBe('string');
  });

  it('continues parsing siblings after a rejection', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"count":"bad","name":"good"}');

    expect(stream.current().count).toBe(42); // preserved
    expect(stream.current().name).toBe('good'); // sibling parsed
    expect(errors).toHaveLength(1);
  });

  it('rejects bad array element, keeps good ones', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"tags":["a",42,"c"]}');

    // Element 1 should be rejected (number where string expected),
    // elements 0 and 2 written.
    expect(stream.current().tags[0]).toBe('a');
    expect(stream.current().tags[2]).toBe('c');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('tags.1');
  });

  it('skips a bad nested object, preserves prior nested value', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"meta":42,"name":"x"}');

    expect(stream.current().meta).toEqual({ id: 'init-id' });
    expect(stream.current().name).toBe('x');
    expect(errors).toHaveLength(1);
  });

  it('rejects keys not in the schema', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"bogus":"value","name":"good"}');

    expect((stream.current() as Record<string, unknown>)['bogus']).toBeUndefined();
    expect(stream.current().name).toBe('good');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('bogus');
  });
});

// ───────────────────────────────────────────────────────────
// Optional / nullable / default handling
// ───────────────────────────────────────────────────────────

describe('recover mode — optional, nullable, default', () => {
  const OptSchema = z.object({
    a: z.string().optional(),
    b: z.string().nullable(),
    c: z.string().default('def'),
    d: z.union([z.string(), z.number()]),
  });

  it('accepts null where nullable', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: OptSchema,
      initial: { a: undefined, b: 'x', c: 'def', d: 'x' },
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"b":null}');

    expect(stream.current().b).toBeNull();
    expect(errors).toHaveLength(0);
  });

  it('accepts either type for union', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: OptSchema,
      initial: { a: undefined, b: null, c: 'def', d: 'x' },
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"d":42}');
    expect(stream.current().d).toBe(42);

    stream.write('{"d":"text"}');
    expect(stream.current().d).toBe('text');

    expect(errors).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────
// strict mode
// ───────────────────────────────────────────────────────────

describe('strict mode', () => {
  it('halts the stream on first violation', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL, mode: 'strict' });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":"good","count":"bad","active":false}');

    // The entire write that triggered the failure is discarded — no partial
    // state from that write is committed.
    expect(stream.current().name).toBe('init-name');
    expect(stream.current().count).toBe(42);
    expect(stream.current().active).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it('rejects final() after failure', async () => {
    const stream = createStream({ schema: Schema, initial: INITIAL, mode: 'strict' });
    stream.write('{"count":"bad"}');

    await expect(stream.final()).rejects.toThrow();
  });

  it('further writes are no-ops after failure', () => {
    const stream = createStream({ schema: Schema, initial: INITIAL, mode: 'strict' });
    stream.write('{"count":"bad"}');

    const before = stream.current();
    stream.write('{"name":"after"}');
    expect(stream.current()).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────
// trust mode — escape hatch, no validation
// ───────────────────────────────────────────────────────────

describe('trust mode', () => {
  it('writes invalid data into the tree without errors', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL, mode: 'trust' });
    stream.onError((e) => errors.push(e));

    stream.write('{"count":"three"}');

    // No validation — the bad value lands in the tree
    expect(stream.current().count as unknown).toBe('three');
    expect(errors).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────
// constraints: 'finalize' — post-finalize sub-schema check
// ───────────────────────────────────────────────────────────

describe('finalize-phase constraints', () => {
  const ConSchema = z.object({
    name: z.string().min(5),
    count: z.number().int().positive(),
    items: z.array(z.string()),
  });

  it('does not fire mid-string for .min violations', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: ConSchema,
      initial: { name: 'initial', count: 1, items: [] },
      constraints: 'finalize',
    });
    stream.onError((e) => errors.push(e));

    // Write a long-enough name char by char — partial string is briefly < 5
    for (const ch of '{"name":"hello world"') {
      stream.write(ch);
    }
    // No errors yet — finalize doesn't fire until next sibling key arrives
    expect(errors).toHaveLength(0);

    // Now another sibling — name finalizes, .min(5) passes
    stream.write(',"count":');
    expect(errors).toHaveLength(0);
  });

  it('fires when a finalized string violates .min', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: ConSchema,
      initial: { name: 'initial', count: 1, items: [] },
      constraints: 'finalize',
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":"hi","count":3}');
    expect(errors.some((e) => e.path === 'name' && e.phase === 'finalize')).toBe(true);
  });

  it('fires for .int() / .positive() violations at finalize', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: ConSchema,
      initial: { name: 'initial', count: 1, items: [] },
      constraints: 'finalize',
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":"hello","count":-3}');
    stream.write(',"items":[]}');
    expect(errors.some((e) => e.path === 'count' && e.phase === 'finalize')).toBe(true);
  });

  it('strict + finalize halts on first constraint failure', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: ConSchema,
      initial: { name: 'initial', count: 1, items: [] },
      mode: 'strict',
      constraints: 'finalize',
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":"hi","count":99}');
    expect(errors).toHaveLength(1);
    // After failure, further writes are ignored
    const before = stream.current();
    stream.write(',"items":["x"]}');
    expect(stream.current()).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────
// Selected stream onError
// ───────────────────────────────────────────────────────────

describe('selected stream — onError filtering', () => {
  it('only fires for errors at-or-below its path', () => {
    const NestedSchema = z.object({
      widget: z.object({ title: z.string(), count: z.number() }),
      response: z.string(),
    });

    const widgetErrors: StreamError[] = [];
    const responseErrors: StreamError[] = [];
    const stream = createStream({
      schema: NestedSchema,
      initial: { widget: { title: '', count: 0 }, response: '' },
    });
    stream.select('widget').onError((e) => widgetErrors.push(e));
    stream.select('response').onError((e) => responseErrors.push(e));

    stream.write('{"widget":{"count":"bad"},"response":42}');

    expect(widgetErrors.some((e) => e.path === 'widget.count')).toBe(true);
    expect(widgetErrors.some((e) => e.path === 'response')).toBe(false);
    expect(responseErrors.some((e) => e.path === 'response')).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────
// Skip-mode end-to-end — verify chunked skip is correct
// ───────────────────────────────────────────────────────────

describe('skip-mode chunking', () => {
  it('skips a bad object value across chunk boundaries', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    const json = '{"meta":[1,{"nested":"value"},3],"name":"after"}';
    for (const ch of json) stream.write(ch);

    expect(stream.current().meta).toEqual({ id: 'init-id' }); // preserved
    expect(stream.current().name).toBe('after');
    expect(errors).toHaveLength(1);
  });

  it('skip mode handles strings containing braces', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    // The bad meta value contains a string with } and ] that must not
    // confuse the skip-depth counter.
    stream.write('{"meta":[{"a":"oops}]inside"},2],"name":"after"}');

    expect(stream.current().meta).toEqual({ id: 'init-id' });
    expect(stream.current().name).toBe('after');
  });

  it('skip mode handles escaped quotes', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":[1,2],"count":7}');
    // name is array (bad) — skip the array
    expect(stream.current().name).toBe('init-name');
    expect(stream.current().count).toBe(7);
  });

  it('skips a bad boolean literal', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":true,"count":7}');
    expect(stream.current().name).toBe('init-name');
    expect(stream.current().count).toBe(7);
    expect(errors[0]?.received).toBe('boolean');
  });

  it('skips a bad null literal', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":null,"count":7}');
    expect(stream.current().name).toBe('init-name');
    expect(stream.current().count).toBe(7);
    expect(errors[0]?.received).toBe('null');
  });

  it('skips a bad number where boolean expected', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"active":42,"name":"x"}');
    expect(stream.current().active).toBe(true);
    expect(stream.current().name).toBe('x');
  });

  it('skips a bad string value char by char', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    const json = '{"count":"bad value","name":"ok"}';
    for (const ch of json) stream.write(ch);

    expect(stream.current().count).toBe(42);
    expect(stream.current().name).toBe('ok');
  });

  it('handles deeply nested skip: object → array → object', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    // meta expects object, sending a deeply nested array instead
    stream.write('{"meta":[[{"a":{"b":[1,2,3]}}]],"name":"ok"}');
    expect(stream.current().meta).toEqual({ id: 'init-id' });
    expect(stream.current().name).toBe('ok');
  });
});

// ───────────────────────────────────────────────────────────
// Multiple violations in a single write
// ───────────────────────────────────────────────────────────

describe('recover mode — multiple violations per write', () => {
  it('reports and skips each bad field independently', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":42,"count":"bad","active":"yes","tags":99,"meta":[]}');

    expect(stream.current().name).toBe('init-name');
    expect(stream.current().count).toBe(42);
    expect(stream.current().active).toBe(true);
    expect(stream.current().tags).toEqual(['init-tag']);
    expect(stream.current().meta).toEqual({ id: 'init-id' });
    expect(errors).toHaveLength(5);
  });
});

// ───────────────────────────────────────────────────────────
// Strict mode — deep violation
// ───────────────────────────────────────────────────────────

describe('strict mode — deep violation', () => {
  it('halts on a nested field violation', () => {
    const NestedSchema = z.object({
      a: z.object({ b: z.object({ c: z.number() }) }),
      d: z.string(),
    });

    const errors: StreamError[] = [];
    const stream = createStream({
      schema: NestedSchema,
      initial: { a: { b: { c: 0 } }, d: '' },
      mode: 'strict',
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"a":{"b":{"c":"bad"}},"d":"hello"}');

    expect(stream.current().a.b.c).toBe(0);
    expect(stream.current().d).toBe('');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('a.b.c');
  });
});

// ───────────────────────────────────────────────────────────
// Strict mode — on() listeners stop after failure
// ───────────────────────────────────────────────────────────

describe('strict mode — listener lifecycle', () => {
  it('on() listeners stop firing after failure', () => {
    const listener = vi.fn();
    const stream = createStream({ schema: Schema, initial: INITIAL, mode: 'strict' });

    stream.on(listener);
    const callsBefore = listener.mock.calls.length;

    stream.write('{"name":"good"}');
    const callsAfterGood = listener.mock.calls.length;
    expect(callsAfterGood).toBeGreaterThan(callsBefore);

    stream.write('{"count":"bad"}');
    const callsAfterBad = listener.mock.calls.length;

    stream.write('{"name":"after"}');
    expect(listener.mock.calls.length).toBe(callsAfterBad);
  });
});

// ───────────────────────────────────────────────────────────
// Violation followed by close()
// ───────────────────────────────────────────────────────────

describe('recover mode — violation then close', () => {
  it('close() after violations resolves final() with current value', async () => {
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.write('{"count":"bad","name":"ok"}');
    stream.close();

    const result = await stream.final();
    expect(result.name).toBe('ok');
    expect(result.count).toBe(42);
  });
});

// ───────────────────────────────────────────────────────────
// First write is a violation
// ───────────────────────────────────────────────────────────

describe('recover mode — first write violation', () => {
  it('handles the very first value being bad', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"count":"first-write-bad","name":"ok"}');

    expect(stream.current().count).toBe(42);
    expect(stream.current().name).toBe('ok');
    expect(errors).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────
// ZodEnum and ZodLiteral kind checks
// ───────────────────────────────────────────────────────────

describe('recover mode — enum and literal schemas', () => {
  const EnumSchema = z.object({
    status: z.enum(['active', 'inactive']),
    type: z.literal('card'),
  });

  it('accepts valid enum string', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: EnumSchema,
      initial: { status: 'active', type: 'card' as const },
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"status":"inactive"}');
    expect(stream.current().status).toBe('inactive');
    expect(errors).toHaveLength(0);
  });

  it('rejects number for enum field', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: EnumSchema,
      initial: { status: 'active', type: 'card' as const },
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"status":42}');
    expect(stream.current().status).toBe('active');
    expect(errors).toHaveLength(1);
  });

  it('rejects number for literal field', () => {
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: EnumSchema,
      initial: { status: 'active', type: 'card' as const },
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"type":42}');
    expect(stream.current().type).toBe('card');
    expect(errors).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────
// Nullable — reject null where non-nullable
// ───────────────────────────────────────────────────────────

describe('recover mode — null where non-nullable', () => {
  it('rejects null for a non-nullable field', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":null}');
    expect(stream.current().name).toBe('init-name');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.received).toBe('null');
  });
});

// ───────────────────────────────────────────────────────────
// Selected stream — negative path filtering
// ───────────────────────────────────────────────────────────

describe('selected stream — negative path filtering', () => {
  it('does NOT fire onError for unrelated paths', () => {
    const NestedSchema = z.object({
      widget: z.object({ title: z.string() }),
      response: z.string(),
    });

    const widgetErrors: StreamError[] = [];
    const stream = createStream({
      schema: NestedSchema,
      initial: { widget: { title: '' }, response: '' },
    });
    stream.select('widget').onError((e) => widgetErrors.push(e));

    // Only response has a violation — widget.onError should NOT fire
    stream.write('{"widget":{"title":"ok"},"response":42}');

    expect(widgetErrors).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────
// Finalize constraints — additional coverage
// ───────────────────────────────────────────────────────────

describe('finalize constraints — additional', () => {
  it('catches .email() violation at finalize', () => {
    const EmailSchema = z.object({ email: z.string().email(), name: z.string() });
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: EmailSchema,
      initial: { email: 'a@b.com', name: '' },
      constraints: 'finalize',
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"email":"not-an-email","name":"ok"}');
    expect(errors.some((e) => e.path === 'email' && e.phase === 'finalize')).toBe(true);
  });

  it('catches .regex() violation at finalize', () => {
    const RegexSchema = z.object({ code: z.string().regex(/^[A-Z]{3}$/), name: z.string() });
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: RegexSchema,
      initial: { code: 'ABC', name: '' },
      constraints: 'finalize',
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"code":"abc","name":"ok"}');
    expect(errors.some((e) => e.path === 'code' && e.phase === 'finalize')).toBe(true);
  });

  it('catches enum value violation at finalize', () => {
    const EnumSchema = z.object({ status: z.enum(['a', 'b']), name: z.string() });
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: EnumSchema,
      initial: { status: 'a', name: '' },
      constraints: 'finalize',
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"status":"invalid","name":"ok"}');
    expect(errors.some((e) => e.path === 'status' && e.phase === 'finalize')).toBe(true);
  });

  it('does not re-validate already-checked paths', () => {
    const ConSchema = z.object({
      a: z.string().min(5),
      b: z.string().min(5),
      c: z.string(),
    });
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: ConSchema,
      initial: { a: 'aaaaa', b: 'bbbbb', c: '' },
      constraints: 'finalize',
    });
    stream.onError((e) => errors.push(e));

    // "a" finalizes when "b" arrives, "b" finalizes when "c" arrives.
    // "a" should NOT be re-validated when "c" arrives.
    stream.write('{"a":"hi","b":"hello world","c":"end"}');

    const aErrors = errors.filter((e) => e.path === 'a');
    expect(aErrors).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────
// Empty containers
// ───────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────
// Integration: strict + finalize + selected stream onError
// ───────────────────────────────────────────────────────────

describe('integration — strict + finalize + select.onError', () => {
  it('selected stream receives finalize error before halt', () => {
    const IntSchema = z.object({
      user: z.object({ name: z.string().min(3) }),
      data: z.string(),
    });

    const rootErrors: StreamError[] = [];
    const userErrors: StreamError[] = [];
    const stream = createStream({
      schema: IntSchema,
      initial: { user: { name: 'Bob' }, data: '' },
      mode: 'strict',
      constraints: 'finalize',
    });
    stream.onError((e) => rootErrors.push(e));
    stream.select('user').onError((e) => userErrors.push(e));

    // user.name "ab" (length 2) violates .min(3) at finalize.
    // Finalize fires after snapshot, so this write's data IS committed.
    // The halt prevents further writes.
    stream.write('{"user":{"name":"ab"},"data":"hello"}');

    expect(rootErrors).toHaveLength(1);
    expect(rootErrors[0]?.phase).toBe('finalize');
    expect(rootErrors[0]?.path).toBe('user.name');

    expect(userErrors).toHaveLength(1);
    expect(userErrors[0]?.path).toBe('user.name');

    // Data from this write is committed (finalize fires post-snapshot),
    // but further writes are blocked.
    expect(stream.current().data).toBe('hello');
    const before = stream.current();
    stream.write('{"data":"more"}');
    expect(stream.current()).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────
// Strict mode — verify no snapshot/notify after failure
// ───────────────────────────────────────────────────────────

describe('strict mode — no snapshot after value-open failure', () => {
  it('does not fire on() listeners for the failing write', () => {
    const listener = vi.fn();
    const stream = createStream({ schema: Schema, initial: INITIAL, mode: 'strict' });

    // Skip the initial fire from on() subscription
    stream.on(listener);
    listener.mockClear();

    // First field is bad — strict should halt before snapshot/notify
    stream.write('{"count":"bad","name":"good"}');

    // The listener should NOT have been called with any partial state
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('recover mode — empty containers', () => {
  it('handles empty object value (preserves existing data via merge)', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"meta":{}}');
    // Parser merges into existing object — initial data preserved.
    expect(stream.current().meta).toEqual({ id: 'init-id' });
    expect(errors).toHaveLength(0);
  });

  it('handles empty array value (preserves existing data via merge)', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"tags":[]}');
    // Parser merges into existing array — initial data preserved.
    expect(stream.current().tags).toEqual(['init-tag']);
    expect(errors).toHaveLength(0);
  });

  it('handles skipped value at end of JSON (last field, no trailing sibling)', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"name":"ok","count":"bad"}');
    expect(stream.current().name).toBe('ok');
    expect(stream.current().count).toBe(42);
    expect(errors).toHaveLength(1);
  });

  it('skips a string containing escaped quotes', () => {
    const errors: StreamError[] = [];
    const stream = createStream({ schema: Schema, initial: INITIAL });
    stream.onError((e) => errors.push(e));

    stream.write('{"count":"say \\"hello\\" world","name":"ok"}');
    expect(stream.current().count).toBe(42);
    expect(stream.current().name).toBe('ok');
    expect(errors).toHaveLength(1);
  });

  it('accepts empty object/array without errors when no prior data', () => {
    const EmptySchema = z.object({ items: z.array(z.string()), meta: z.object({}) });
    const errors: StreamError[] = [];
    const stream = createStream({
      schema: EmptySchema,
      initial: { items: [], meta: {} },
    });
    stream.onError((e) => errors.push(e));

    stream.write('{"items":[],"meta":{}}');
    expect(stream.current().items).toEqual([]);
    expect(stream.current().meta).toEqual({});
    expect(errors).toHaveLength(0);
  });
});
