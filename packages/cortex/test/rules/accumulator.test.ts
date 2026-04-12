import { describe, it, expect } from 'vitest';
import { createBus } from '../../src/manifold/bus';
import { attachAccumulators, type WatchDefs } from '../../src/rules';

describe('attachAccumulators', () => {
  it('count: increments on each matching event', () => {
    const bus = createBus({});
    const defs: WatchDefs = {
      toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
    };
    const { state } = attachAccumulators(bus, defs);

    expect(state.values().toolCalls).toBe(0);

    bus.emit({ topic: 'cortex.tool.observed', payload: {}, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().toolCalls).toBe(1);

    bus.emit({ topic: 'cortex.tool.observed', payload: {}, meta: { timestamp: 0, correlationId: 'x' } });
    bus.emit({ topic: 'cortex.tool.observed', payload: {}, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().toolCalls).toBe(3);
  });

  it('sum: adds a numeric field from each event', () => {
    const bus = createBus({});
    const defs: WatchDefs = {
      totalTokens: { event: 'cortex.tool.observed', aggregate: 'sum', field: 'tokensUsed' },
    };
    const { state } = attachAccumulators(bus, defs);

    bus.emit({ topic: 'cortex.tool.observed', payload: { tokensUsed: 100 }, meta: { timestamp: 0, correlationId: 'x' } });
    bus.emit({ topic: 'cortex.tool.observed', payload: { tokensUsed: 250 }, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().totalTokens).toBe(350);
  });

  it('sum: handles nested field paths', () => {
    const bus = createBus({});
    const defs: WatchDefs = {
      total: { event: 'test.event', aggregate: 'sum', field: 'usage.tokens' },
    };
    const { state } = attachAccumulators(bus, defs);

    bus.emit({ topic: 'test.event', payload: { usage: { tokens: 50 } }, meta: { timestamp: 0, correlationId: 'x' } });
    bus.emit({ topic: 'test.event', payload: { usage: { tokens: 30 } }, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().total).toBe(80);
  });

  it('latest: stores the most recent value', () => {
    const bus = createBus({});
    const defs: WatchDefs = {
      sentiment: { event: 'analysis.sentiment', aggregate: 'latest', field: 'score' },
    };
    const { state } = attachAccumulators(bus, defs);

    expect(state.values().sentiment).toBeUndefined();

    bus.emit({ topic: 'analysis.sentiment', payload: { score: 0.8 }, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().sentiment).toBe(0.8);

    bus.emit({ topic: 'analysis.sentiment', payload: { score: 0.3 }, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().sentiment).toBe(0.3);
  });

  it('ignores events on non-matching topics', () => {
    const bus = createBus({});
    const defs: WatchDefs = {
      toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
    };
    const { state } = attachAccumulators(bus, defs);

    bus.emit({ topic: 'cortex.agent.completed', payload: {}, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().toolCalls).toBe(0);
  });

  it('reset: zeroes all accumulators', () => {
    const bus = createBus({});
    const defs: WatchDefs = {
      calls: { event: 'e', aggregate: 'count' },
      total: { event: 'e', aggregate: 'sum', field: 'n' },
      last: { event: 'e', aggregate: 'latest', field: 'v' },
    };
    const { state } = attachAccumulators(bus, defs);

    bus.emit({ topic: 'e', payload: { n: 10, v: 'hello' }, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().calls).toBe(1);
    expect(state.values().total).toBe(10);
    expect(state.values().last).toBe('hello');

    state.reset();
    expect(state.values().calls).toBe(0);
    expect(state.values().total).toBe(0);
    expect(state.values().last).toBeUndefined();
  });

  it('unsub: stops accumulating', () => {
    const bus = createBus({});
    const defs: WatchDefs = {
      calls: { event: 'e', aggregate: 'count' },
    };
    const { state, unsub } = attachAccumulators(bus, defs);

    bus.emit({ topic: 'e', payload: {}, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().calls).toBe(1);

    unsub();
    bus.emit({ topic: 'e', payload: {}, meta: { timestamp: 0, correlationId: 'x' } });
    expect(state.values().calls).toBe(1);
  });
});
