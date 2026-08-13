import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@shared';
import type { NovaEvent } from '@shared';

describe('event bus — typed NovaEvent', () => {
  it('emits and receives by discriminator', () => {
    const bus = createEventBus();
    const received: NovaEvent[] = [];
    bus.on('ui:click', (event) => {
      received.push(event);
    });
    bus.emit({ type: 'ui:click', ref: 'btn' });
    expect(received).toHaveLength(1);
    const got = received[0];
    if (got === undefined) throw new Error('no event captured');
    expect(got.type).toBe('ui:click');
    if (got.type === 'ui:click') expect(got.ref).toBe('btn');
  });

  it('does not invoke non-matching subscriptions', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('ui:click', handler);
    bus.emit({ type: 'ui:input', ref: 'field', payload: 'x' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports regex subscriptions', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on(/^ui:/, handler);
    bus.emit({ type: 'ui:click', ref: 'a' });
    // What an input carries rides in `payload` — a ui event has no `value`
    // field, and never has. Excess-property checking was the only thing that
    // would have said so, and it was switched off for this whole directory.
    bus.emit({ type: 'ui:input', ref: 'b', payload: 'y' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('once fires only one time', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.once('ui:click', handler);
    bus.emit({ type: 'ui:click', ref: 'a' });
    bus.emit({ type: 'ui:click', ref: 'a' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe removes handler', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const off = bus.on('ui:click', handler);
    off();
    bus.emit({ type: 'ui:click', ref: 'a' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler errors do not crash the bus', () => {
    const bus = createEventBus();
    const good = vi.fn();
    bus.on('ui:click', () => {
      throw new Error('boom');
    });
    bus.on('ui:click', good);
    expect(() => bus.emit({ type: 'ui:click', ref: 'a' })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

type GenericEvent = { type: string; payload?: unknown };

describe('event bus — generic + scoped', () => {
  it('accepts a custom event type via generic parameter', () => {
    const bus = createEventBus<GenericEvent>();
    const received: GenericEvent[] = [];
    bus.on('custom', (event) => {
      received.push(event);
    });
    bus.emit({ type: 'custom', payload: 42 });
    expect(received).toHaveLength(1);
    expect(received[0]?.payload).toBe(42);
  });

  it('scoped bus bubbles emissions to parent', () => {
    const bus = createEventBus<GenericEvent>();
    const parentHandler = vi.fn();
    bus.on(/.*/, parentHandler);

    const child = bus.scoped();
    child.emit({ type: 'click', payload: { x: 1 } });

    expect(parentHandler).toHaveBeenCalledTimes(1);
    expect(parentHandler).toHaveBeenCalledWith({ type: 'click', payload: { x: 1 } });
  });

  it('nested scoped buses chain bubbling', () => {
    const bus = createEventBus<GenericEvent>();
    const root = vi.fn();
    const middle = vi.fn();
    bus.on(/.*/, root);
    const a = bus.scoped();
    a.on(/.*/, middle);
    const b = a.scoped();
    b.emit({ type: 'click' });

    expect(middle).toHaveBeenCalledTimes(1);
    expect(root).toHaveBeenCalledTimes(1);
  });

  it('parent does not receive events from sibling scopes before scoping', () => {
    const bus = createEventBus<GenericEvent>();
    const child = bus.scoped();
    const childHandler = vi.fn();
    child.on('tick', childHandler);
    bus.emit({ type: 'tick' });
    // Parent emissions do NOT bubble down to children.
    expect(childHandler).not.toHaveBeenCalled();
  });
});
