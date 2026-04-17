import { describe, it, expect, vi } from 'vitest';
import { createBus } from '../../src/manifold/bus';
import {
  createRulesEngine,
  createEffectRegistry,
  defineRule,
  type RulesEngine,
  type EffectRegistry,
} from '../../src/rules';
import type { Bus } from '../../src/types';

const setup = (): { bus: Bus; engine: RulesEngine; effects: EffectRegistry } => {
  const bus = createBus({});
  const effects = createEffectRegistry();
  const engine = createRulesEngine(bus, effects);
  return { bus, engine, effects };
};

const emit = (bus: Bus, topic: string, payload: unknown = {}): void => {
  bus.emit(topic, payload, { correlationId: 'test' });
};

describe('RulesEngine', () => {
  it('no rules → no match', () => {
    const { engine } = setup();
    expect(engine.evaluate()).toEqual({ matched: false });
  });

  it('count accumulator + $gte condition fires inject effect', () => {
    const { bus, engine } = setup();
    const rule = defineRule({
      id: 'tool-limit',
      watch: {
        toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
      },
      rules: [
        { when: { $gte: ['$watch.toolCalls', 3] }, then: { inject: 'Slow down.' } },
      ],
    });
    engine.register(rule);

    emit(bus, 'cortex.tool.observed');
    emit(bus, 'cortex.tool.observed');
    expect(engine.evaluate()).toEqual({ matched: false });

    emit(bus, 'cortex.tool.observed');
    expect(engine.evaluate()).toEqual({
      matched: true,
      ruleId: 'tool-limit',
      effect: { inject: 'Slow down.' },
    });
  });

  it('first matching rule wins', () => {
    const { bus, engine } = setup();
    const rule = defineRule({
      id: 'multi',
      watch: {
        calls: { event: 'e', aggregate: 'count' },
      },
      rules: [
        { when: { $gte: ['$watch.calls', 5] }, then: { abort: 'Too many.' } },
        { when: { $gte: ['$watch.calls', 3] }, then: { inject: 'Warning.' } },
      ],
    });
    engine.register(rule);

    for (let i = 0; i < 3; i++) emit(bus, 'e');
    const r1 = engine.evaluate();
    expect(r1.matched).toBe(true);
    if (r1.matched) expect(r1.effect).toEqual({ inject: 'Warning.' });

    for (let i = 0; i < 2; i++) emit(bus, 'e');
    const r2 = engine.evaluate();
    expect(r2.matched).toBe(true);
    if (r2.matched) expect(r2.effect).toEqual({ abort: 'Too many.' });
  });

  it('multiple rules — first registered wins', () => {
    const { bus, engine } = setup();
    engine.register(defineRule({
      id: 'rule-a',
      watch: { c: { event: 'e', aggregate: 'count' } },
      rules: [{ when: { $gte: ['$watch.c', 1] }, then: { inject: 'A' } }],
    }));
    engine.register(defineRule({
      id: 'rule-b',
      watch: { c: { event: 'e', aggregate: 'count' } },
      rules: [{ when: { $gte: ['$watch.c', 1] }, then: { inject: 'B' } }],
    }));

    emit(bus, 'e');
    const result = engine.evaluate();
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.ruleId).toBe('rule-a');
      expect(result.effect).toEqual({ inject: 'A' });
    }
  });

  it('unregister removes the rule', () => {
    const { bus, engine } = setup();
    const rule = defineRule({
      id: 'temp',
      watch: { c: { event: 'e', aggregate: 'count' } },
      rules: [{ when: { $gte: ['$watch.c', 1] }, then: { inject: 'X' } }],
    });
    const unsub = engine.register(rule);

    emit(bus, 'e');
    expect(engine.evaluate().matched).toBe(true);

    unsub();
    // After unregister, the rule no longer fires.
    expect(engine.evaluate().matched).toBe(false);
  });

  it('snapshot returns accumulator state', () => {
    const { bus, engine } = setup();
    engine.register(defineRule({
      id: 'snap',
      watch: {
        calls: { event: 'e', aggregate: 'count' },
        total: { event: 'e', aggregate: 'sum', field: 'n' },
      },
      rules: [],
    }));

    emit(bus, 'e', { n: 10 });
    emit(bus, 'e', { n: 20 });

    expect(engine.snapshot()).toEqual({
      snap: { calls: 2, total: 30 },
    });
  });

  it('reset zeroes all accumulators', () => {
    const { bus, engine } = setup();
    engine.register(defineRule({
      id: 'r',
      watch: { c: { event: 'e', aggregate: 'count' } },
      rules: [{ when: { $gte: ['$watch.c', 1] }, then: { inject: 'X' } }],
    }));

    emit(bus, 'e');
    expect(engine.evaluate().matched).toBe(true);

    engine.reset();
    expect(engine.evaluate().matched).toBe(false);
    expect(engine.snapshot()).toEqual({ r: { c: 0 } });
  });

  it('call effect invokes registered handler', async () => {
    const { engine, effects } = setup();
    const handler = vi.fn();
    effects.register('notify', handler);

    const ctx = { workflowId: 'w', agentId: 'a', tick: 0, ruleId: 'r' };
    await engine.executeCallEffect({ call: 'notify' }, ctx);
    expect(handler).toHaveBeenCalledWith(ctx);
  });

  it('call effect is no-op for unregistered handler', async () => {
    const { engine } = setup();
    // Should not throw
    await engine.executeCallEffect({ call: 'nonexistent' }, {
      workflowId: 'w', agentId: 'a', tick: 0, ruleId: 'r',
    });
  });

  it('sum accumulator with real-world token tracking', () => {
    const { bus, engine } = setup();
    engine.register(defineRule({
      id: 'token-budget',
      watch: {
        tokensUsed: { event: 'cortex.tool.observed', aggregate: 'sum', field: 'tokensUsed' },
      },
      rules: [
        { when: { $gte: ['$watch.tokensUsed', 1000] }, then: { abort: 'Token budget blown.' } },
      ],
    }));

    emit(bus, 'cortex.tool.observed', { tokensUsed: 400 });
    expect(engine.evaluate().matched).toBe(false);

    emit(bus, 'cortex.tool.observed', { tokensUsed: 300 });
    expect(engine.evaluate().matched).toBe(false);

    emit(bus, 'cortex.tool.observed', { tokensUsed: 400 });
    const result = engine.evaluate();
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.effect).toEqual({ abort: 'Token budget blown.' });
  });

  it('latest accumulator + compound condition', () => {
    const { bus, engine } = setup();
    engine.register(defineRule({
      id: 'escalation',
      watch: {
        toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
        sentiment: { event: 'analysis.sentiment', aggregate: 'latest', field: 'score' },
      },
      rules: [
        {
          when: {
            $and: [
              { $gte: ['$watch.toolCalls', 3] },
              { $lt: ['$watch.sentiment', 0.3] },
            ],
          },
          then: { inject: 'Customer is frustrated. Wrap up.' },
        },
      ],
    }));

    // 3 tool calls but no sentiment → $lt on undefined is false
    emit(bus, 'cortex.tool.observed');
    emit(bus, 'cortex.tool.observed');
    emit(bus, 'cortex.tool.observed');
    expect(engine.evaluate().matched).toBe(false);

    // High sentiment → still no match
    emit(bus, 'analysis.sentiment', { score: 0.8 });
    expect(engine.evaluate().matched).toBe(false);

    // Low sentiment → now both conditions fire
    emit(bus, 'analysis.sentiment', { score: 0.2 });
    expect(engine.evaluate().matched).toBe(true);
  });
});
