import { describe, it, expect } from 'vitest';
import { evaluateCondition, type ConditionScope } from '../../src/rules';

describe('evaluateCondition', () => {
  const scope: ConditionScope = {
    watch: { toolCalls: 5, tokensUsed: 8500, sentiment: 0.2 },
    budget: { tokensRemaining: 1500, ticksRemaining: 3 },
  };

  // ─── $eq ──────────────────────────────────────────────────
  it('$eq with literals', () => {
    expect(evaluateCondition({ $eq: [5, 5] }, scope)).toBe(true);
    expect(evaluateCondition({ $eq: [5, 6] }, scope)).toBe(false);
  });

  it('$eq with path resolution', () => {
    expect(evaluateCondition({ $eq: ['$watch.toolCalls', 5] }, scope)).toBe(true);
    expect(evaluateCondition({ $eq: ['$watch.toolCalls', 6] }, scope)).toBe(false);
  });

  // ─── $neq ─────────────────────────────────────────────────
  it('$neq', () => {
    expect(evaluateCondition({ $neq: ['$watch.toolCalls', 6] }, scope)).toBe(true);
    expect(evaluateCondition({ $neq: ['$watch.toolCalls', 5] }, scope)).toBe(false);
  });

  // ─── $gt / $gte / $lt / $lte ──────────────────────────────
  it('$gt', () => {
    expect(evaluateCondition({ $gt: ['$watch.toolCalls', 4] }, scope)).toBe(true);
    expect(evaluateCondition({ $gt: ['$watch.toolCalls', 5] }, scope)).toBe(false);
  });

  it('$gte', () => {
    expect(evaluateCondition({ $gte: ['$watch.toolCalls', 5] }, scope)).toBe(true);
    expect(evaluateCondition({ $gte: ['$watch.toolCalls', 6] }, scope)).toBe(false);
  });

  it('$lt', () => {
    expect(evaluateCondition({ $lt: ['$watch.sentiment', 0.3] }, scope)).toBe(true);
    expect(evaluateCondition({ $lt: ['$watch.sentiment', 0.1] }, scope)).toBe(false);
  });

  it('$lte', () => {
    expect(evaluateCondition({ $lte: ['$watch.sentiment', 0.2] }, scope)).toBe(true);
    expect(evaluateCondition({ $lte: ['$watch.sentiment', 0.1] }, scope)).toBe(false);
  });

  // ─── $and ─────────────────────────────────────────────────
  it('$and — all true', () => {
    const cond = {
      $and: [
        { $gte: ['$watch.toolCalls', 5] },
        { $lt: ['$watch.sentiment', 0.3] },
      ],
    };
    expect(evaluateCondition(cond, scope)).toBe(true);
  });

  it('$and — one false', () => {
    const cond = {
      $and: [
        { $gte: ['$watch.toolCalls', 5] },
        { $gt: ['$watch.sentiment', 0.5] },
      ],
    };
    expect(evaluateCondition(cond, scope)).toBe(false);
  });

  // ─── $or ──────────────────────────────────────────────────
  it('$or — one true', () => {
    const cond = {
      $or: [
        { $gt: ['$watch.toolCalls', 100] },
        { $lt: ['$watch.sentiment', 0.3] },
      ],
    };
    expect(evaluateCondition(cond, scope)).toBe(true);
  });

  it('$or — all false', () => {
    const cond = {
      $or: [
        { $gt: ['$watch.toolCalls', 100] },
        { $gt: ['$watch.sentiment', 0.5] },
      ],
    };
    expect(evaluateCondition(cond, scope)).toBe(false);
  });

  // ─── $not ─────────────────────────────────────────────────
  it('$not', () => {
    expect(evaluateCondition({ $not: { $eq: ['$watch.toolCalls', 5] } }, scope)).toBe(false);
    expect(evaluateCondition({ $not: { $eq: ['$watch.toolCalls', 99] } }, scope)).toBe(true);
  });

  // ─── Nested composition ───────────────────────────────────
  it('nested $and inside $or', () => {
    const cond = {
      $or: [
        { $and: [{ $gte: ['$watch.toolCalls', 10] }, { $lt: ['$budget.tokensRemaining', 500] }] },
        { $lt: ['$watch.sentiment', 0.3] },
      ],
    };
    // First branch false (toolCalls=5 < 10), second branch true (sentiment=0.2 < 0.3)
    expect(evaluateCondition(cond, scope)).toBe(true);
  });

  // ─── Edge cases ───────────────────────────────────────────
  it('missing path resolves to undefined', () => {
    expect(evaluateCondition({ $eq: ['$watch.nonexistent', null] }, scope)).toBe(false);
  });

  it('string comparison', () => {
    const s: ConditionScope = { watch: { status: 'active' } };
    expect(evaluateCondition({ $eq: ['$watch.status', 'active'] }, s)).toBe(true);
    expect(evaluateCondition({ $gt: ['$watch.status', 'aaa'] }, s)).toBe(true);
  });
});
