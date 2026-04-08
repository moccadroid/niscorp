import { describe, expect, it } from 'vitest';
import { createMessageBus } from '@shared';

describe('createMessageBus', () => {
  it('publish/subscribe round-trip', () => {
    const bus = createMessageBus();
    const seen: unknown[] = [];
    bus.subscribe('topic', (p) => seen.push(p));
    bus.publish('topic', { x: 1 });
    expect(seen).toEqual([{ x: 1 }]);
  });

  it('send delivers payload + from', () => {
    const bus = createMessageBus();
    const calls: Array<{ p: unknown; from: string | undefined }> = [];
    bus.subscribe('inbox', (p, from) => calls.push({ p, from }));
    bus.send('alice', 'inbox', 'hello');
    expect(calls).toEqual([{ p: 'hello', from: 'alice' }]);
  });

  it('only matching channel handlers receive', () => {
    const bus = createMessageBus();
    const seen: string[] = [];
    bus.subscribe('a', () => seen.push('a'));
    bus.subscribe('b', () => seen.push('b'));
    bus.publish('a', null);
    expect(seen).toEqual(['a']);
  });

  it('unsubscribe stops delivery', () => {
    const bus = createMessageBus();
    const seen: unknown[] = [];
    const off = bus.subscribe('t', (p) => seen.push(p));
    bus.publish('t', 1);
    off();
    bus.publish('t', 2);
    expect(seen).toEqual([1]);
  });

  it('handler errors do not crash the bus', () => {
    const bus = createMessageBus();
    const good = (): void => {
      good.called = true;
    };
    good.called = false;
    bus.subscribe('t', () => {
      throw new Error('boom');
    });
    bus.subscribe('t', good);
    expect(() => bus.publish('t')).not.toThrow();
    expect(good.called).toBe(true);
  });
});
