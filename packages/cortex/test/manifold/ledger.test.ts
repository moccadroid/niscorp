import { describe, expect, it } from 'vitest';
import { createLedger } from '../../src/manifold/ledger';

describe('Ledger', () => {
  it('opens and closes workflow entries', () => {
    const l = createLedger();
    expect(l.isOpen('wf')).toBe(false);
    l.open('wf');
    expect(l.isOpen('wf')).toBe(true);
    l.close('wf');
    expect(l.isOpen('wf')).toBe(false);
  });

  it('tracks tokens, ticks, and tool calls', () => {
    const l = createLedger({ defaultBudget: { maxTokens: 100, maxTicks: 5, maxToolCalls: 10 } });
    l.open('wf');
    l.addTokens('wf', 30);
    l.addTokens('wf', 20);
    l.addTick('wf');
    l.addToolCall('wf');
    const s = l.snapshot('wf');
    expect(s.tokensUsed).toBe(50);
    expect(s.tokensRemaining).toBe(50);
    expect(s.ticksUsed).toBe(1);
    expect(s.toolCallsUsed).toBe(1);
  });

  it('snapshot returns zeros for closed workflows', () => {
    const l = createLedger();
    const s = l.snapshot('not-open');
    expect(s.tokensUsed).toBe(0);
    expect(s.tokensRemaining).toBe(0);
  });

  it('throws when adding usage to a closed workflow', () => {
    const l = createLedger();
    expect(() => l.addTokens('nope', 1)).toThrow();
  });
});
