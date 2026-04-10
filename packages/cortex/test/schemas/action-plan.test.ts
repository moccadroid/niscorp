import { describe, expect, it } from 'vitest';
import { ActionPlanSchema } from '../../src/schemas/action-plan.schema';

describe('ActionPlanSchema', () => {
  it('accepts a single final node', () => {
    const plan = [{ kind: 'final', result: { ok: true } }];
    const r = ActionPlanSchema.safeParse(plan);
    expect(r.success).toBe(true);
  });

  it('accepts a use_tool followed by final', () => {
    const plan = [
      { kind: 'use_tool', toolId: 'kb.search', input: { q: 'cats' } },
      { kind: 'final', result: 'done' },
    ];
    const r = ActionPlanSchema.safeParse(plan);
    expect(r.success).toBe(true);
  });

  it('accepts a parallel block with branches', () => {
    const plan = [
      {
        kind: 'parallel',
        branches: [
          { kind: 'ask_agent', agentId: 'sentiment', input: 'hi' },
          { kind: 'ask_agent', agentId: 'kb', input: 'q' },
        ],
      },
      { kind: 'final', result: 'done' },
    ];
    const r = ActionPlanSchema.safeParse(plan);
    expect(r.success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    const plan = [{ kind: 'noop' }];
    const r = ActionPlanSchema.safeParse(plan);
    expect(r.success).toBe(false);
  });

  it('rejects an empty plan', () => {
    const r = ActionPlanSchema.safeParse([]);
    expect(r.success).toBe(false);
  });
});
