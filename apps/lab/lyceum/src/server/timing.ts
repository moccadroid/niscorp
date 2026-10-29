import { z } from 'zod';
import { anchorDraft, createTide, createTideDriver, draftSchemaOf, occurrencesBetween, ReflexSchema, zonedParts } from '@niscorp/tide';
import type { DraftChoice, Reflex, ReflexDraft, Tide, TideDriver } from '@niscorp/tide';
import { createTideStore } from '@niscorp/tide/postgres';
import { createReflexAgent, effectProblem, isDraft, reflexConversation } from '@niscorp/tide/agent';
import type { OfferedEffect, ReflexAnswer } from '@niscorp/tide/agent';
import { evaluate } from '@niscorp/prism';
import { createSignal } from '@niscorp/signal';
import type { MossServer } from '@niscorp/moss';
import { deckShow, slidesDeck, TALK_DECK } from '@lyceum/app/vex/deck.entries';
import { timersAll } from '@lyceum/app/vex/timer.entries';
import { mintSession } from '@niscorp/moss';
import { vexOver, wireAs } from './vex-over';
import type { LyceumRuntime } from './runtime';

export const talkZone = (env: Record<string, string | undefined>): string => env['LYCEUM_TZ'] ?? 'Europe/Vienna';

const NOTIFY: OfferedEffect = {
  name: 'notify',
  description:
    'Show a message to whoever saved this automation, on their screen, the moment it fires — a reminder, an alert, or that a timer is up. Shown only if they are connected then; if they are not, it is not shown later.',
  input: z.object({ text: z.string().min(1).describe('The message, in a few words.') }).strict(),
};

// No slides to show: only the message is offered.
export const timerEffects = (slideIds: readonly string[]): readonly OfferedEffect[] => {
  const [first, ...rest] = slideIds;
  if (first === undefined) return [NOTIFY];
  return [
    {
      name: 'deck.show',
      description: "Put one of the deck's slides on the projector, in place of the one showing now. The stage and every screen following the deck move with it.",
      input: z.object({ slideId: z.enum([first, ...rest]).describe('The slide to put on screen, by its id.') }).strict(),
    },
    NOTIFY,
  ];
};

// The speaker's timers run as the clock, which can move the slide and nothing
// else; anybody else's runs as them, and is not offered the slides at all.
const SPEAKER = 'speaker';
export const runsAs = (savedBy: string): string => (savedBy === SPEAKER ? 'clock' : savedBy);
export const slidesFor = (as: string, slideIds: readonly string[]): readonly string[] => (as === 'clock' ? slideIds : []);

const SlideIdsSchema = z.array(z.object({ slide_id: z.string() }));
export const slideIdsOf = (rows: unknown): string[] => SlideIdsSchema.parse(rows ?? []).map((row) => row.slide_id);

const pad = (n: number): string => String(n).padStart(2, '0');
export const localNow = (instant: number, tz: string, seconds = false): string => {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}${seconds ? `:${pad(p.second)}` : ''}`;
};

export const whenWords = (draft: ReflexDraft): string => {
  if ('timer' in draft.on) {
    const { hours = 0, minutes = 0, seconds = 0 } = draft.on.timer;
    const parts = [hours > 0 ? `${hours} h` : '', minutes > 0 ? `${minutes} min` : '', seconds > 0 ? `${seconds} s` : ''].filter((part) => part !== '');
    return `${parts.join(' ')} after you save`;
  }
  if ('clock' in draft.on) return 'every' in draft.on.clock ? `every ${draft.on.clock.every} at ${draft.on.clock.at}` : `fires at ${draft.on.clock.at.slice(11)}`;
  return '';
};

export const dueOf = (reflex: Reflex, now: number): number | undefined =>
  'clock' in reflex.on ? occurrencesBetween(reflex.on.clock, now, now + 7 * 86_400_000, 1)[0]?.at : undefined;

export const DRAFT_HERE: DraftChoice = { triggers: ['clock', 'timer'] };
export const DraftHereSchema = draftSchemaOf(DRAFT_HERE);

export type Written = { answer: ReflexAnswer; reasoning: string | undefined };

export type TimerRequest = {
  intent: string;
  now: number;
  tz: string;
  facts: string;
  slideIds: readonly string[];
  earlier: readonly { request: string; answer: ReflexAnswer; reasoning: string | undefined }[];
};

// The draft's schema already offers only a clock or a timer; this line stays
// because without it the model's refusals and replies get worse.
export const TRIGGERS_HERE =
  'Here, an automation can only be set off by the clock: a date and time, a repeating time of day, or a timer. Nothing here can fire it by hand or on an event. When only a timer is asked for, with nothing to do when it ends, it notifies the person.';
export type TimerWriter = { kind: 'live' | 'fake'; write: (request: TimerRequest) => Promise<Written> };

const liveWriter = (): TimerWriter => {
  const llm = createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
  return {
    kind: 'live',
    write: async ({ intent, now, tz, facts, slideIds, earlier }) => {
      const at = localNow(now, tz);
      const input = earlier.length === 0 ? { intent, now: at, tz } : reflexConversation({ now: at, tz, earlier, latest: intent });
      const result = await createReflexAgent({ effects: timerEffects(slideIds), ...DRAFT_HERE }).run(input, { llm, producers: [() => facts, () => TRIGGERS_HERE] }).result;
      if (!result.ok) throw new Error(`The automation could not be written: ${result.error.message}`);
      return { answer: result.output.data, reasoning: result.output.reasoning ?? undefined };
    },
  };
};

const fakeWriter = (): TimerWriter => ({
  kind: 'fake',
  write: async ({ intent, slideIds, earlier }) => {
    const closing = { name: 'deck.show', input: { slideId: slideIds.at(-1) ?? '' } };
    const showsSlides = slideIds.length > 0;
    if (/email/i.test(intent)) return { answer: { refused: 'Nothing here can send an email.' }, reasoning: 'An email: no offered effect sends one.' };
    const last = earlier.at(-1)?.answer;
    if (last !== undefined && isDraft(last) && showsSlides && /slide/i.test(intent)) {
      return { answer: DraftHereSchema.parse({ ...last, intent: 'Put the closing slide on screen.', effect: closing }), reasoning: 'A correction: the same time, the closing slide instead.' };
    }
    const minutes = /(\d+)\s*min/i.exec(intent)?.[1];
    if (minutes !== undefined) {
      const slide = showsSlides && /slide/i.test(intent);
      return {
        answer: DraftHereSchema.parse({
          id: `timer-${minutes}m`,
          intent: slide ? `Put the closing slide on screen in ${minutes} minutes.` : `Notify: time is up, in ${minutes} minutes.`,
          on: { timer: { minutes: Number(minutes) } },
          effect: slide ? closing : { name: 'notify', input: { text: 'Time is up.' } },
        }),
        reasoning: `A length of time: ${minutes} minutes.`,
      };
    }
    const [first] = earlier;
    if (first !== undefined && last !== undefined && 'question' in last) {
      return {
        answer: DraftHereSchema.parse({ id: 'timer-1m', intent: `Notify: ${first.request}`, on: { timer: { minutes: 1 } }, effect: { name: 'notify', input: { text: first.request } } }),
        reasoning: 'A reply to the question: the first request, answered.',
      };
    }
    return { answer: { question: 'In the morning or in the evening?' }, reasoning: 'No length of time, and a time of day without morning or evening.' };
  },
});

export const createTimerWriter = (env: Record<string, string | undefined>): TimerWriter => {
  const asked = env['LYCEUM_TIMER'];
  const hasKey = (env['GROQ_API_KEY'] ?? '') !== '';
  if (asked === 'fake' || (asked !== 'live' && !hasKey)) return fakeWriter();
  if (!hasKey) throw new Error('lyceum: LYCEUM_TIMER=live needs GROQ_API_KEY in apps/lab/lyceum/.env.');
  return liveWriter();
};

// Whatever the document said, the reflex runs as `as`, stamped here.
export const armable = (document: unknown, slideIds: readonly string[], as = 'clock'): Reflex => {
  const reflex = ReflexSchema.parse(document);
  const problem = effectProblem(timerEffects(slidesFor(as, slideIds)), reflex);
  if (problem !== undefined) throw new Error(problem);
  return { ...reflex, as };
};

export const proposable = (document: unknown, slideIds: readonly string[]): ReflexDraft => {
  const draft = DraftHereSchema.parse(document);
  const problem = effectProblem(timerEffects(slideIds), draft);
  if (problem !== undefined) throw new Error(problem);
  return draft;
};

export const anchorTimer = (draft: ReflexDraft, timerId: string, at: number, tz: string, slideIds: readonly string[], as = 'clock'): Reflex =>
  armable(anchorDraft({ ...draft, id: timerId }, { at, tz }), slideIds, as);

// Delivered to the stage whenever the saved automations are loaded again.
export const TIMERS_CHANNEL = 'timers-changed';

export type Timing = { tide: Tide; driver: TideDriver; reload: () => Promise<number>; stop: () => Promise<void> };

export const startTiming = async (server: MossServer, runtime: LyceumRuntime): Promise<Timing> => {
  // Showing a slide is armed only for the clock (armable).
  const clock = vexOver(wireAs(server, await mintSession(runtime.pool, 'clock', 30 * 86_400_000)));
  const savedBy = new Map<string, string>();

  const tide = createTide({
    store: createTideStore(runtime.pool),
    storeUnwatchedWrites: false,
    transform: evaluate,
    select: async () => {
      throw new Error('lyceum: a timer selects nothing');
    },
    effects: () => ({
      'deck.show': {
        writes: ['deck'],
        run: async (input: unknown) => clock(deckShow.fingerprint, { deck: TALK_DECK, slideId: z.object({ slideId: z.string() }).parse(input).slideId }),
      },
      // Only if a terminal of theirs is attached now: a durable shell outlives
      // its last connection, and delivering into one nobody is looking at would
      // show the message later, which the description does not promise.
      notify: {
        writes: [],
        run: async (input: unknown, ctx) => {
          const { text } = z.object({ text: z.string() }).parse(input);
          const to = savedBy.get(ctx.reflexId);
          if (to === undefined) return { shown: false, why: 'nobody saved this automation' };
          const connected = (server.shells?.list() ?? []).some((shell) => shell.principal === to && shell.connections > 0);
          const shown = connected && (server.shells?.deliver(to, 'notify', { text }) ?? false);
          return shown ? { shown: true, to } : { shown: false, to, why: 'they were not connected' };
        },
      },
    }),
    actor: (as) => as,
  });
  const driver = createTideDriver({ tide });

  const reload = async (): Promise<number> => {
    const rows = z.array(z.object({ timer_id: z.string(), reflex: z.unknown(), saved_by: z.string() })).parse(await server.executeAs('scheduler', timersAll.fingerprint, {}));
    savedBy.clear();
    for (const row of rows) savedBy.set(row.timer_id, row.saved_by);
    const slideIds = slideIdsOf(await server.executeAs('scheduler', slidesDeck.fingerprint, {}));
    const reflexes = rows.flatMap((row) => {
      try {
        return [armable(row.reflex, slideIds, runsAs(row.saved_by))];
      } catch (error) {
        console.error('[lyceum] a saved timer could not be loaded:', error instanceof Error ? error.message : error);
        return [];
      }
    });
    await tide.load(reflexes, { at: Date.now() });
    void driver.wake();
    server.shells?.deliver('stage', TIMERS_CHANNEL);
    return reflexes.length;
  };
  await reload();
  return {
    tide,
    driver,
    reload,
    stop: () => driver.stop(),
  };
};
