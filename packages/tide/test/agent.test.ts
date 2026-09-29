import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { answerSchemaOf, createReflexAgent, effectProblem, isDraft, ReflexAnswerSchema, reflexConversation } from '../src/agent';
import { ReflexDraftSchema } from '../src';

// The reflex agent's own gate: a draft names one of the HOST's effects, with
// an input that effect's schema accepts. Tide's schema cannot know either —
// the effects are the host's vocabulary.

const EFFECTS = [{ name: 'digest.send', description: 'Send a digest to a team.', input: z.object({ team: z.enum(['sales', 'support']) }).strict() }];
const draft = (effect: { name: string; input?: unknown }) =>
  ReflexDraftSchema.parse({ id: 'digest', intent: 'Send the digest.', on: { clock: { every: 'week', on: 'mon', at: '09:00', tz: 'Europe/Vienna' } }, effect });

describe('effectProblem', () => {
  it('passes an offered effect with an input its schema accepts', () => {
    expect(effectProblem(EFFECTS, draft({ name: 'digest.send', input: { team: 'sales' } }))).toBeUndefined();
  });

  it('names the offered effects when the draft names another', () => {
    expect(effectProblem(EFFECTS, draft({ name: 'digest.drop', input: {} }))).toContain('digest.send');
  });

  it("says what the effect's own schema refused", () => {
    const problem = effectProblem(EFFECTS, draft({ name: 'digest.send', input: { team: 'nobody' } }));
    expect(problem).toContain('team');
  });
});

describe('createReflexAgent', () => {
  it("is a cortex agent whose output is tide's reflex draft, checked against the host's effects in the run", async () => {
    const agent = createReflexAgent({ effects: EFFECTS });
    expect(agent.agentId).toBe('tide.reflex');
    expect(agent.config.output?.schema).toBeDefined();
    const validate = agent.config.output?.validate;
    expect(await validate?.({ data: draft({ name: 'digest.drop' }) })).toHaveProperty('retry');
    expect(await validate?.({ data: draft({ name: 'digest.send', input: { team: 'sales' } }) })).toEqual({ ok: true });
  });
});

describe('the three answers', () => {
  it('a draft, a question or a refusal — and nothing else', () => {
    expect(ReflexAnswerSchema.safeParse(draft({ name: 'digest.send', input: { team: 'sales' } })).success).toBe(true);
    expect(ReflexAnswerSchema.safeParse({ question: 'Every Monday, or only this Monday?' }).success).toBe(true);
    expect(ReflexAnswerSchema.safeParse({ refused: 'Nothing offered sends email.' }).success).toBe(true);
    expect(ReflexAnswerSchema.safeParse({ question: '' }).success).toBe(false);
    expect(ReflexAnswerSchema.safeParse({ question: 'Which?', refused: 'No.' }).success).toBe(false);
  });

  it('only a draft is held to the offered effects', async () => {
    const validate = createReflexAgent({ effects: EFFECTS }).config.output?.validate;
    expect(await validate?.({ data: { question: 'Every Monday, or only this Monday?' } })).toEqual({ ok: true });
    expect(await validate?.({ data: { refused: 'Nothing offered sends email.' } })).toEqual({ ok: true });
  });

  it('tells a draft from the other two', () => {
    expect(isDraft(ReflexAnswerSchema.parse(draft({ name: 'digest.send', input: { team: 'sales' } })))).toBe(true);
    expect(isDraft(ReflexAnswerSchema.parse({ question: 'Which?' }))).toBe(false);
  });
});

describe('the conversation so far', () => {
  it('each earlier request and the answer given to it — reasoning first — are turns of a chat, the latest words last', () => {
    const messages = reflexConversation({
      now: '2031-04-14T09:20',
      tz: 'America/Chicago',
      earlier: [{ request: 'send the digest on Friday', answer: { question: 'This Friday only, or every Friday?' }, reasoning: 'Friday could be one or all.' }],
      latest: 'every Friday',
    });
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(JSON.parse(String(messages[0]?.content))).toEqual({ intent: 'send the digest on Friday', now: '2031-04-14T09:20', tz: 'America/Chicago' });
    expect(JSON.parse(String(messages[1]?.content))).toEqual({ reasoning: 'Friday could be one or all.', data: { question: 'This Friday only, or every Friday?' } });
    expect(JSON.parse(String(messages[2]?.content)).intent).toBe('every Friday');
  });

  it('an earlier draft is replayed as the answer it was — so a correction has something to correct', () => {
    const earlier = draft({ name: 'digest.send', input: { team: 'sales' } });
    const messages = reflexConversation({ now: '2031-04-14T09:20', tz: 'America/Chicago', earlier: [{ request: 'digest on Mondays', answer: earlier }], latest: 'no, the support team' });
    expect(JSON.parse(String(messages[1]?.content))).toEqual({ data: JSON.parse(JSON.stringify(earlier)) });
  });
});

describe('the draft is what the caller offers', () => {
  const answerOf = (choice: Parameters<typeof answerSchemaOf>[0]) => answerSchemaOf(choice);
  const drafted = (on: unknown, extra: Record<string, unknown> = {}) => ({ id: 'd', intent: 'Do it.', on, effect: { name: 'digest.send', input: { team: 'sales' } }, ...extra });

  it('only the trigger kinds it names', () => {
    const clockAndTimer = answerOf({ triggers: ['clock', 'timer'] });
    expect(clockAndTimer.safeParse(drafted({ timer: { minutes: 5 } })).success).toBe(true);
    expect(clockAndTimer.safeParse(drafted({ clock: { at: '2031-04-14T10:00', tz: 'America/Chicago' } })).success).toBe(true);
    expect(clockAndTimer.safeParse(drafted({ manual: {} })).success).toBe(false);
    expect(clockAndTimer.safeParse(drafted({ fact: { entity: 'orders' } })).success).toBe(false);
  });

  it('and they are all the model is shown', () => {
    const shown = JSON.stringify(z.toJSONSchema(answerOf({ triggers: ['clock', 'timer'] }), { target: 'draft-7', io: 'input' }));
    expect(shown).toContain('A length of time from now');
    expect(shown).not.toContain('by hand');
    expect(shown).not.toContain('a row of an entity is written');
  });

  it('never who it runs as, its policy or whether it is enabled — those are the host\'s', () => {
    const answer = answerOf({});
    expect(answer.safeParse(drafted({ manual: {} }, { as: 'somebody' })).success).toBe(false);
    expect(answer.safeParse(drafted({ manual: {} }, { enabled: false })).success).toBe(false);
    expect(answer.safeParse(drafted({ manual: {} }, { policy: { timeoutMs: 1 } })).success).toBe(false);
    const shown = JSON.stringify(z.toJSONSchema(answer, { target: 'draft-7', io: 'input' }));
    expect(shown).not.toContain('"as"');
    expect(shown).not.toContain('"policy"');
  });

  it('the extra fields only when named', () => {
    const select = { query: { fingerprint: 'orders/open' }, mode: 'batch' };
    expect(answerOf({}).safeParse(drafted({ manual: {} }, { select })).success).toBe(false);
    expect(answerOf({ fields: ['select'] }).safeParse(drafted({ manual: {} }, { select })).success).toBe(true);
  });

  it('every trigger kind by default', () => {
    for (const on of [{ manual: {} }, { fact: { entity: 'orders' } }, { fact: { signal: 'hook' } }, { fact: { run: 'r' } }, { timer: { hours: 1 } }]) {
      expect(ReflexAnswerSchema.safeParse(drafted(on)).success).toBe(true);
    }
  });

  it('a draft needs a trigger kind to be offered', () => {
    expect(() => answerOf({ triggers: [] })).toThrow();
  });
});
