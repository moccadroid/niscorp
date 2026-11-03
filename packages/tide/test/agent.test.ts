import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { answerSchemaOf, createReflexAgent, effectProblem, isDraft, ReflexAnswerSchema, reflexConversation } from '../src/agent';
import type { ReflexAnswer } from '../src/agent';
import { ReflexDraftSchema } from '../src';

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

describe('dates are looked up and checked, never counted', () => {
  const NOW = { intent: 'remind me on Friday at 14:30', now: '2026-11-03T10:30', tz: 'Europe/Vienna' };
  const contextOf = async (input: unknown): Promise<string> => {
    const agent = createReflexAgent({ effects: EFFECTS });
    const parts = await Promise.all((agent.config.context ?? []).map((entry) => (typeof entry === 'function' ? entry({ deps: undefined, input, agent: { id: agent.agentId } }) : entry)));
    return JSON.stringify(parts);
  };
  const once = (at: string) => ReflexDraftSchema.parse({ id: 'd', intent: 'Send it.', on: { clock: { at, tz: 'Europe/Vienna' } }, effect: { name: 'digest.send', input: { team: 'sales' } } });
  const validated = (data: ReflexAnswer, reasoning?: string) => createReflexAgent({ effects: EFFECTS }).config.output?.validate?.({ data, ...(reasoning === undefined ? {} : { reasoning }) });

  it('the agent is told today with its weekday, and the coming weeks as dates it reads a weekday off', async () => {
    const told = await contextOf(NOW);
    expect(told).toContain('Tue 2026-11-03, 10:30');
    expect(told).toContain('Fri 2026-11-06');
    expect(told).toContain('Fri 2026-11-13');
    expect(told).toContain('November 2026: Mon 2 9 16 23 30');
  });

  it('— in a conversation too, from its latest turn', async () => {
    const told = await contextOf(reflexConversation({ now: '2026-11-03T10:30', tz: 'Europe/Vienna', earlier: [], latest: 'on Friday' }));
    expect(told).toContain('Fri 2026-11-06');
  });

  it('a date the reasoning gives the wrong weekday is sent back, with its own weekday and the dates that are that weekday', async () => {
    const answer = await validated(once('2026-11-05T14:30'), 'Friday is Fri 2026-11-05.');
    expect(answer).toHaveProperty('retry');
    expect(JSON.stringify(answer)).toContain('2026-11-05 is a Thursday');
    expect(JSON.stringify(answer)).toContain('Fri 2026-11-06');
  });

  it('a date the reasoning gives its own weekday passes', async () => {
    expect(await validated(once('2026-11-06T14:30'), 'The coming Friday is Fri 2026-11-06.')).toEqual({ ok: true });
  });

  it('a draft is never sent back for how its reasoning words a date: only a weekday that is wrong is', async () => {
    expect(await validated(once('2026-11-04T18:30'), 'Moved 30 minutes later: Wed 4 Nov at 18:30.')).toEqual({ ok: true });
    expect(await validated(once('2026-11-06T14:30'), 'Friday, half past two.')).toEqual({ ok: true });
    expect(await validated(once('2026-11-06T14:30'))).toEqual({ ok: true });
  });

  it('a question that pairs a date with the wrong weekday is sent back too', async () => {
    expect(await validated({ question: 'This Friday or next?' }, 'Fri 2026-11-05 or Fri 2026-11-13.')).toHaveProperty('retry');
    expect(await validated({ question: 'This Friday or next?' }, 'Fri 2026-11-06 or Fri 2026-11-13.')).toEqual({ ok: true });
  });

  it('a clock that repeats, or a timer, names no date: nothing to check', async () => {
    expect(await validated(draft({ name: 'digest.send', input: { team: 'sales' } }))).toEqual({ ok: true });
  });

  it('the coming days are today, the rest of its week from Monday to Sunday, and the two weeks after', async () => {
    const tuesday = await contextOf({ ...NOW, now: '2026-11-03T10:30' });
    expect(tuesday).toContain('today: Tue 2026-11-03 | the rest of this week: Wed 2026-11-04, Thu 2026-11-05, Fri 2026-11-06, Sat 2026-11-07, Sun 2026-11-08 | next week: Mon 2026-11-09,');
    expect(tuesday).toContain('Sun 2026-11-15 | the week after: Mon 2026-11-16,');
    const sunday = await contextOf({ ...NOW, now: '2026-11-08T21:00' });
    expect(sunday).toContain('today: Sun 2026-11-08 | the rest of this week: none | next week: Mon 2026-11-09,');
  });

  it('a `now` in December reads into January and the next year', async () => {
    const told = await contextOf({ ...NOW, now: '2026-12-29T08:00' });
    expect(told).toContain('Fri 2027-01-01');
    expect(told).toContain('December 2026:');
    expect(told).toContain('January 2027:');
  });

  it('it is written from the `now` it is handed, and from the latest turn of a conversation', async () => {
    expect(await contextOf({ ...NOW, now: '2031-04-14T09:20' })).toContain('TODAY — Mon 2031-04-14, 09:20.');
    const turns = [
      { role: 'user', content: JSON.stringify({ intent: 'on Friday', now: '2026-10-01T09:00', tz: 'Europe/Vienna' }) },
      { role: 'assistant', content: JSON.stringify({ data: { question: 'Which Friday?' } }) },
      { role: 'user', content: JSON.stringify({ intent: 'this one', now: '2026-11-03T10:30', tz: 'Europe/Vienna' }) },
    ];
    expect(await contextOf(turns)).toContain('TODAY — Tue 2026-11-03, 10:30.');
  });

  it('a `now` that is no date and time says so, rather than a calendar of nothing', async () => {
    expect(await contextOf({ ...NOW, now: '2026-13-45T10:00' })).toContain('TODAY — not known');
    expect(await contextOf({ ...NOW, now: '2026-11-03' })).toContain('TODAY — not known');
  });

  it('the dates sent back are the weekday it was taken for, on either side', async () => {
    expect(JSON.stringify(await validated(once('2026-11-05T14:30'), 'Fri 2026-11-05'))).toContain('Fri 2026-10-30 and Fri 2026-11-06');
  });

  it('a pair is a weekday word or its abbreviation, any case, then a date — with its time or without', async () => {
    expect(await validated(once('2026-11-06T14:30'), 'Friday, 2026-11-06T14:30.')).toEqual({ ok: true });
    expect(await validated(once('2026-11-05T14:30'), 'friday 2026-11-05')).toHaveProperty('retry');
    expect(await validated(once('2026-11-05T14:30'), 'thurs 2026-11-05')).toEqual({ ok: true });
    expect(await validated(once('2026-11-06T14:30'), 'Fri 2026-11-06. Month 2026-11-01 begins it.')).toEqual({ ok: true });
  });

  it('a date that is none is said to be none', async () => {
    expect(JSON.stringify(await validated(once('2026-11-06T14:30'), 'Fri 2026-11-06, or Fri 2026-02-30'))).toContain('2026-02-30 is not a date');
  });
});
