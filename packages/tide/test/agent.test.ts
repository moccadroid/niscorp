import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createReflexAgent, effectProblem } from '../src/agent';
import { ReflexSchema } from '../src';

// The reflex agent's own gate: a reflex names one of the HOST's effects, with
// an input that effect's schema accepts. Tide's schema cannot know either —
// the effects are the host's vocabulary.

const EFFECTS = [{ name: 'deck.goto', does: 'Show a slide on the projector.', input: z.object({ slideId: z.enum(['slide.title', 'slide.end']) }).strict() }];
const reflex = (effect: { name: string; input?: unknown }) =>
  ReflexSchema.parse({ id: 'end', intent: 'End the talk.', on: { clock: { at: '2026-09-27T19:30', tz: 'Europe/Vienna' } }, effect });

describe('effectProblem', () => {
  it('passes an offered effect with an input its schema accepts', () => {
    expect(effectProblem(EFFECTS, reflex({ name: 'deck.goto', input: { slideId: 'slide.end' } }))).toBeUndefined();
  });

  it('names the offered effects when the reflex names another', () => {
    expect(effectProblem(EFFECTS, reflex({ name: 'deck.next', input: {} }))).toContain('deck.goto');
  });

  it('says what the effect\'s own schema refused', () => {
    const problem = effectProblem(EFFECTS, reflex({ name: 'deck.goto', input: { slideId: 'slide.nowhere' } }));
    expect(problem).toContain('slideId');
  });
});

describe('createReflexAgent', () => {
  it('is a cortex agent whose output is tide\'s reflex, checked against the host\'s effects in the run', async () => {
    const agent = createReflexAgent({ effects: EFFECTS });
    expect(agent.agentId).toBe('tide.reflex');
    expect(agent.config.output?.schema).toBe(ReflexSchema);
    const validate = agent.config.output?.validate;
    expect(await validate?.({ data: reflex({ name: 'deck.next' }) })).toHaveProperty('retry');
    expect(await validate?.({ data: reflex({ name: 'deck.goto', input: { slideId: 'slide.end' } }) })).toEqual({ ok: true });
  });
});
