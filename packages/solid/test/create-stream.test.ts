import { describe, it, expect, vi } from 'vitest';
import { at, lastOf } from './helpers/at';
import { z } from 'zod';
import { createStream } from '../src/create-stream';

const ResponseSchema = z.object({
  widget: z.object({
    type: z.string(),
    title: z.string(),
  }),
  response: z.string(),
  reasoning: z.string(),
  meta: z.object({}),
});

type Response = z.infer<typeof ResponseSchema>;

const INITIAL: Response = {
  widget: { type: '', title: '' },
  response: '',
  reasoning: '',
  meta: {},
};

// ═══════════════════════════════════════════════════════════
// Construction
// ═══════════════════════════════════════════════════════════

describe('createStream — construction', () => {
  it('accepts valid initial value', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    expect(stream.current()).toEqual(INITIAL);
  });

  it('throws on invalid initial', () => {
    expect(() =>
      createStream({ schema: ResponseSchema, initial: { bad: true } as unknown as Response }),
    ).toThrow('[solid]');
  });

  it('derives defaults from schema', () => {
    const Schema = z.object({
      name: z.string().default(''),
      count: z.number().default(0),
      active: z.boolean().default(false),
    });
    const stream = createStream({ schema: Schema });
    expect(stream.current()).toEqual({ name: '', count: 0, active: false });
  });
});

// ═══════════════════════════════════════════════════════════
// Write pipeline
// ═══════════════════════════════════════════════════════════

describe('createStream — write', () => {
  it('updates current value from streamed JSON', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.write('{"widget":{"type":"card","title":"Hello"}');
    expect(stream.current().widget.type).toBe('card');
    expect(stream.current().widget.title).toBe('Hello');
  });

  it('merges partial updates over base', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.write('{"widget":{"type":"card"');
    expect(stream.current().widget.type).toBe('card');
    expect(stream.current().widget.title).toBe(''); // base preserved
    expect(stream.current().response).toBe(''); // base preserved
  });

  it('handles chunked writes', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.write('{"wid');
    stream.write('get":{"type":"c');
    stream.write('ard","title":"He');
    stream.write('llo"}');

    expect(stream.current().widget.type).toBe('card');
    expect(stream.current().widget.title).toBe('Hello');
  });

  it('handles character-by-character streaming', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const json = '{"widget":{"type":"card","title":"Hi"},"response":"ok"}';
    for (const ch of json) {
      stream.write(ch);
    }
    expect(stream.current().widget.type).toBe('card');
    expect(stream.current().response).toBe('ok');
  });

  it('write after close is no-op', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.write('{"widget":{"type":"card","title":"Hi"}}');
    stream.close();
    stream.write('{"response":"should be ignored"}');
    expect(stream.current().response).toBe('');
  });

  it('does not fire listeners when parsed value equals current (real deep-equal path)', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const listener = vi.fn();
    stream.on(listener);
    const callCount = listener.mock.calls.length;

    // Write the same object that matches the initial state — parses fine, but equals current
    stream.write('{"widget":{"type":"","title":""},"response":"","reasoning":"","meta":{}}');
    expect(listener.mock.calls.length).toBe(callCount);
  });
});

// ═══════════════════════════════════════════════════════════
// Array streaming
// ═══════════════════════════════════════════════════════════

describe('createStream — arrays', () => {
  const ItemsSchema = z.object({
    items: z.array(z.object({ name: z.string(), value: z.number() })),
    status: z.string(),
  });

  const ITEMS_INITIAL = { items: [], status: '' };

  it('streams array elements incrementally', () => {
    const stream = createStream({ schema: ItemsSchema, initial: ITEMS_INITIAL });
    stream.write('{"items":[{"name":"first","value":1');
    expect(stream.current().items).toEqual([{ name: 'first', value: 1 }]);

    stream.write('},{"name":"sec');
    expect(stream.current().items.length).toBe(2);
    expect(stream.current().items[0]).toEqual({ name: 'first', value: 1 });
    expect(stream.current().items[1]?.name).toBe('sec');
  });

  it('element-level merge preserves earlier elements', () => {
    const stream = createStream({
      schema: ItemsSchema,
      initial: { items: [{ name: 'base', value: 0 }], status: 'ok' },
    });

    // Stream only overwrites first element name
    stream.write('{"items":[{"name":"updated","value":0}]');
    expect(stream.current().items[0]).toEqual({ name: 'updated', value: 0 });
  });

  it('array element selection works', () => {
    const stream = createStream({ schema: ItemsSchema, initial: ITEMS_INITIAL });
    const values: unknown[] = [];
    stream.select('items.0').on(v => values.push(structuredClone(v)));

    stream.write('{"items":[{"name":"first","value":1},{"name":"second","value":2}]');
    // Should have received the first element
    expect(lastOf(values)).toEqual({ name: 'first', value: 1 });
  });

  it('array element finalizes when next element starts', async () => {
    const stream = createStream({ schema: ItemsSchema, initial: ITEMS_INITIAL });
    const firstFinal = stream.select('items.0').final();

    stream.write('{"items":[{"name":"first","value":1},{"name":"second"');

    const result = await firstFinal;
    expect(result).toEqual({ name: 'first', value: 1 });
  });

  it('primitive array streaming', () => {
    const Schema = z.object({ tags: z.array(z.string()) });
    const stream = createStream({ schema: Schema, initial: { tags: [] } });

    stream.write('{"tags":["alpha","beta"');
    expect(stream.current().tags).toEqual(['alpha', 'beta']);

    stream.write(',"gamma"]}');
    expect(stream.current().tags).toEqual(['alpha', 'beta', 'gamma']);
  });
});

// ═══════════════════════════════════════════════════════════
// Subscriptions
// ═══════════════════════════════════════════════════════════

describe('createStream — on()', () => {
  it('fires immediately with current value', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const values: Response[] = [];
    stream.on(v => values.push(structuredClone(v)));
    expect(values.length).toBe(1);
    expect(values[0]).toEqual(INITIAL);
  });

  it('fires on each change', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const values: Response[] = [];
    stream.on(v => values.push(structuredClone(v)));

    stream.write('{"widget":{"type":"card"');
    stream.write(',"title":"Hello"}');

    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(lastOf(values).widget.title).toBe('Hello');
  });

  it('unsubscribe stops notifications', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const listener = vi.fn();
    const unsub = stream.on(listener);

    unsub();
    stream.write('{"widget":{"type":"card","title":"Hi"}}');
    expect(listener.mock.calls.length).toBe(1); // only the initial fire
  });

  it('re-entrancy: subscribing inside on() callback defers immediate fire', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const innerValues: Response[] = [];
    let innerUnsub: (() => void) | undefined;

    stream.on((_value) => {
      // Subscribe from inside a callback — should not fire immediately during this cycle
      if (!innerUnsub) {
        innerUnsub = stream.on(v => innerValues.push(structuredClone(v)));
      }
    });

    // After the initial notification cycle completes, the inner listener
    // should have received its deferred immediate fire
    expect(innerValues.length).toBe(1);
    expect(innerValues[0]).toEqual(INITIAL);

    // Now write — both listeners should fire
    stream.write('{"widget":{"type":"card","title":"Hi"}}');
    expect(innerValues.length).toBe(2);

    innerUnsub?.();
  });
});

// ═══════════════════════════════════════════════════════════
// Finalization
// ═══════════════════════════════════════════════════════════

describe('createStream — final()', () => {
  it('resolves when root JSON object closes', async () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const finalPromise = stream.final();

    stream.write('{"widget":{"type":"card","title":"Hi"},"response":"ok","reasoning":"because","meta":{}}');

    const result = await finalPromise;
    expect(result.widget.type).toBe('card');
    expect(result.response).toBe('ok');
  });

  it('resolves on close() even without complete JSON', async () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const finalPromise = stream.final();

    stream.write('{"widget":{"type":"card"');
    stream.close();

    const result = await finalPromise;
    expect(result.widget.type).toBe('card');
  });

  it('onFinal fires once', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const listener = vi.fn();
    stream.onFinal(listener);

    stream.write('{"widget":{"type":"card","title":"Hi"},"response":"ok","reasoning":"because","meta":{}}');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('onFinal fires immediately if already final', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.write('{"widget":{"type":"card","title":"Hi"},"response":"ok","reasoning":"because","meta":{}}');

    const listener = vi.fn();
    stream.onFinal(listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Select
// ═══════════════════════════════════════════════════════════

describe('createStream — select()', () => {
  it('projects subtree value', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.write('{"widget":{"type":"card","title":"Hello"}}');

    const widget = stream.select<{ type: string; title: string }>('widget');
    expect(widget.current()).toEqual({ type: 'card', title: 'Hello' });
  });

  it('cached — same path returns same instance', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    expect(stream.select('widget')).toBe(stream.select('widget'));
  });

  it('deep path selection', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.write('{"widget":{"type":"card","title":"Hello"}}');
    expect(stream.select<string>('widget.title').current()).toBe('Hello');
  });

  it('chained select equals direct deep path', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.write('{"widget":{"type":"card","title":"Hello"}}');

    const direct = stream.select<string>('widget.title').current();
    const chained = stream.select('widget').select<string>('title').current();
    expect(direct).toBe(chained);
  });

  it('selected stream on() fires with projected value', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const values: string[] = [];
    stream.select<string>('response').on(v => values.push(v));

    stream.write('{"widget":{"type":"card","title":"Hi"},"response":"Hello World"');

    expect(lastOf(values)).toBe('Hello World');
  });

  it('selected stream does not emit when its subtree is unchanged', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const listener = vi.fn();
    stream.select('widget').on(listener);
    const callCount = listener.mock.calls.length;

    // Change response, not widget — widget listener should not fire
    stream.write('{"widget":{"type":"","title":""},"response":"changed"');
    expect(listener.mock.calls.length).toBe(callCount);
  });
});

// ═══════════════════════════════════════════════════════════
// Subtree finalization
// ═══════════════════════════════════════════════════════════

describe('createStream — subtree finalization', () => {
  it('widget finalizes when parser moves past it', async () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const widgetFinal = stream.select('widget').final();

    stream.write('{"widget":{"type":"card","title":"Hi"},"response":"');

    const result = await widgetFinal;
    expect(result).toEqual({ type: 'card', title: 'Hi' });
  });

  it('nested path finalizes correctly', async () => {
    const Schema = z.object({
      widget: z.object({
        field1: z.object({ sub: z.string() }),
        field2: z.string(),
      }),
      response: z.string(),
    });

    const stream = createStream({
      schema: Schema,
      initial: { widget: { field1: { sub: '' }, field2: '' }, response: '' },
    });

    const field1Final = stream.select('widget.field1').final();
    stream.write('{"widget":{"field1":{"sub":"x"},"field2":"y"');

    const result = await field1Final;
    expect(result).toEqual({ sub: 'x' });
  });

  it('all subtrees finalize on root close', async () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const metaFinal = stream.select('meta').final();

    stream.write('{"widget":{"type":"card","title":"Hi"},"response":"ok","reasoning":"because","meta":{}}');

    const result = await metaFinal;
    expect(result).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════
// Close
// ═══════════════════════════════════════════════════════════

describe('createStream — close()', () => {
  it('is idempotent', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const listener = vi.fn();
    stream.onFinal(listener);

    stream.write('{"widget":{"type":"card","title":"Hi"}}');
    stream.close();
    stream.close();
    stream.close();

    // onFinal should have fired exactly once
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Destroy
// ═══════════════════════════════════════════════════════════

describe('createStream — destroy()', () => {
  it('prevents further writes', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.final().catch(() => {});
    stream.destroy();
    stream.write('{"widget":{"type":"card","title":"Hi"}}');
    expect(stream.current()).toEqual(INITIAL);
  });

  it('rejects pending final promise', async () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const finalPromise = stream.final();
    stream.destroy();
    await expect(finalPromise).rejects.toThrow('[solid] stream destroyed');
  });

  it('clears listeners', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const listener = vi.fn();
    stream.on(listener);
    stream.final().catch(() => {});
    stream.destroy();

    const callsAfterDestroy = listener.mock.calls.length;
    stream.write('{"widget":{"type":"card","title":"Hi"}}');
    expect(listener.mock.calls.length).toBe(callsAfterDestroy);
  });

  it('selected stream can be destroyed independently', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const widgetListener = vi.fn();
    const responseListener = vi.fn();

    const widgetStream = stream.select('widget');
    widgetStream.on(widgetListener);
    widgetStream.final().catch(() => {});

    stream.select('response').on(responseListener);

    // Destroy widget selection only
    widgetStream.destroy();

    const widgetCalls = widgetListener.mock.calls.length;
    const responseCalls = responseListener.mock.calls.length;

    stream.write('{"widget":{"type":"card","title":"Hi"},"response":"changed"');

    // Widget listener should NOT have fired
    expect(widgetListener.mock.calls.length).toBe(widgetCalls);
    // Response listener SHOULD have fired
    expect(responseListener.mock.calls.length).toBeGreaterThan(responseCalls);
  });

  it('select after destroy returns dead stream', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    stream.final().catch(() => {});
    stream.destroy();

    const dead = stream.select('widget');
    expect(dead.current()).toBe(undefined);
    // final() on dead stream should reject
    dead.final().catch((err: Error) => {
      expect(err.message).toContain('destroyed');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// onFinal unsubscribe
// ═══════════════════════════════════════════════════════════

describe('createStream — onFinal unsubscribe', () => {
  it('unsubscribed onFinal listener does not fire', () => {
    const stream = createStream({ schema: ResponseSchema, initial: INITIAL });
    const listener = vi.fn();
    const unsub = stream.onFinal(listener);

    unsub();

    stream.write('{"widget":{"type":"card","title":"Hi"},"response":"ok","reasoning":"because","meta":{}}');

    expect(listener).not.toHaveBeenCalled();
  });
});
