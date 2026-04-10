import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../../src/manifold/bus';
import type { BusEvent } from '../../src/types';

const ev = (topic: string, payload: unknown = null): BusEvent => ({
  topic,
  payload,
  meta: { timestamp: Date.now(), correlationId: 'test' },
});

describe('Bus', () => {
  it('delivers events to matching subscribers in registration order', () => {
    const bus = createBus();
    const calls: string[] = [];
    bus.on('foo.*', () => calls.push('a'));
    bus.on('foo.bar', () => calls.push('b'));
    bus.on('other', () => calls.push('c'));
    bus.emit(ev('foo.bar'));
    expect(calls).toEqual(['a', 'b']);
  });

  it('returns an unsubscribe function', () => {
    const bus = createBus();
    let count = 0;
    const off = bus.on('topic', () => {
      count += 1;
    });
    bus.emit(ev('topic'));
    off();
    bus.emit(ev('topic'));
    expect(count).toBe(1);
  });

  it('unsubscribe inside a handler does not affect the current emit', () => {
    const bus = createBus();
    const calls: string[] = [];
    let off2: () => void = () => {};
    bus.on('topic', () => {
      calls.push('a');
      off2();
    });
    off2 = bus.on('topic', () => {
      calls.push('b');
    });
    bus.emit(ev('topic'));
    expect(calls).toEqual(['a', 'b']);
    bus.emit(ev('topic'));
    expect(calls).toEqual(['a', 'b', 'a']);
  });

  it('catches synchronous handler errors and re-emits cortex.error', () => {
    const onError = vi.fn();
    const bus = createBus({ onHandlerError: onError });
    const errors: BusEvent[] = [];
    bus.on('cortex.error', (e) => errors.push(e));
    bus.on('boom', () => {
      throw new Error('kaboom');
    });
    bus.emit(ev('boom'));
    expect(onError).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(1);
    expect((errors[0]?.payload as { message?: string }).message).toContain('kaboom');
  });

  it('catches async handler rejections', async () => {
    const onError = vi.fn();
    const bus = createBus({ onHandlerError: onError });
    bus.on('boom', async () => {
      throw new Error('async kaboom');
    });
    bus.emit(ev('boom'));
    // Allow the rejected promise's catch to run.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalled();
  });

  it('does not infinite-loop when a cortex.error handler throws', () => {
    const bus = createBus();
    bus.on('cortex.error', () => {
      throw new Error('error handler boom');
    });
    bus.on('boom', () => {
      throw new Error('first boom');
    });
    expect(() => bus.emit(ev('boom'))).not.toThrow();
  });

  it('waitFor resolves on a matching event', async () => {
    const bus = createBus();
    setTimeout(() => bus.emit(ev('expected', { hello: true })), 5);
    const result = await bus.waitFor('expected');
    expect(result.payload).toEqual({ hello: true });
  });

  it('waitFor honors the filter option', async () => {
    const bus = createBus();
    setTimeout(() => bus.emit(ev('item', { id: 1 })), 5);
    setTimeout(() => bus.emit(ev('item', { id: 2 })), 10);
    const result = await bus.waitFor('item', {
      filter: (e) => (e.payload as { id?: number }).id === 2,
    });
    expect((result.payload as { id?: number }).id).toBe(2);
  });

  it('waitFor times out', async () => {
    const bus = createBus();
    await expect(bus.waitFor('never', { timeoutMs: 10 })).rejects.toThrow(/timed out/);
  });

  it('waitFor honors AbortSignal', async () => {
    const bus = createBus();
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5);
    await expect(bus.waitFor('never', { signal: ctrl.signal })).rejects.toThrow(/aborted/);
  });

  it('dispatch returns a correlationId and emits the event', () => {
    const bus = createBus();
    let captured: BusEvent | undefined;
    bus.on('topic', (e) => {
      captured = e;
    });
    const corr = bus.dispatch('topic', { x: 1 }, { workflowId: 'wf-1' });
    expect(captured?.meta.correlationId).toBe(corr);
    expect(captured?.meta.workflowId).toBe('wf-1');
    expect(captured?.payload).toEqual({ x: 1 });
  });
});
