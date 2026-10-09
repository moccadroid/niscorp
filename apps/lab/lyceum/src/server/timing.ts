import { z } from 'zod';
import { anchorDraft, createTide, draftSchemaOf, occurrencesBetween, ReflexSchema, zonedParts } from '@niscorp/tide';
import type { DraftChoice, Reflex, ReflexDraft, Tide } from '@niscorp/tide';
import { createReflexAgent, effectProblem, isDraft, reflexConversation } from '@niscorp/tide/agent';
import type { OfferedEffect, ReflexAnswer } from '@niscorp/tide/agent';
import { evaluate } from '@niscorp/prism';
import { createSignal } from '@niscorp/signal';
import { createTideDriver, createTideStore, mintSession } from '@niscorp/moss';
import type { MossServer, TideDriver } from '@niscorp/moss';
import { deckShow, slidesDeck, TALK_DECK } from '@lyceum/app/vex/deck.entries';
import { timersAll } from '@lyceum/app/vex/timer.entries';
import { vexOver, wireAs } from './vex-over';
import type { LyceumRuntime } from './runtime';

// THE TALK'S TIMERS. The speaker asks their assistant for one — "a timer for
// five minutes", "show the last slide in thirty minutes" — and a model writes
// it: a tide reflex DRAFT, the automation as a document. The speaker reads it
// and saves it; saving anchors it (a timer's "five minutes" counts from the
// press, to the second) and from then on it runs with no model at all. That
// is the contrast the talk draws: an agent that re-reads its instructions on
// every tick versus one that writes the automation once. When a request can
// be read more than one way, the model asks instead (`{ question }`). The
// person's answer — or their correction of a draft they have not saved — goes
// back to it with the conversation so far, and it tries again.
//
//   WRITING  the reflex agent (@niscorp/tide/agent) on gpt-oss-120b, handed the
//            effects offered here — or, LYCEUM_TIMER=fake, a deterministic
//            stand-in that reads "N minutes" (the checks, a talk with no
//            network). Unset: live with a Groq key, fake without.
//   SAVING   the speaker's press: the draft anchored at that instant
//            (`anchorTimer`), written as the speaker, and loaded into tide.
//   RUNNING  tide on moss's durable store, woken by moss's driver. Every saved
//            timer is a row (`timers`), loaded at boot as the `scheduler`
//            machinery role and on every save. Each runs AS the `clock`
//            principal, which can put a slide on screen and nothing else —
//            the host stamps that, never the model. `notify` writes nothing:
//            it shows a message in the live shell of whoever saved it.

// The talk happens somewhere; its clocks are that place's.
export const talkZone = (env: Record<string, string | undefined>): string => env['LYCEUM_TZ'] ?? 'Europe/Vienna';

// What a timer may do: the host's vocabulary, offered to the model with a
// description and the schema of its input — what it does and what it is for,
// and nothing about any particular request.
// Which slide a request means is for the model to work out from the deck,
// handed to it as facts (the assistant's grounding), never from a hint here.
//
// The slides a timer may name are the deck's ROWS, read when a timer is
// written and again when it is loaded — so a slide cut from the deck is one no
// saved timer can put up, and the source names none.
export const timerEffects = (slideIds: readonly string[]): readonly OfferedEffect[] => {
  const [first, ...rest] = slideIds;
  if (first === undefined) throw new Error('lyceum: the deck has no slides for a timer to show');
  return [
    {
      name: 'deck.show',
      description: "Put one of the deck's slides on the projector, in place of the one showing now. The stage and every screen following the deck move with it.",
      input: z.object({ slideId: z.enum([first, ...rest]).describe('The slide to put on screen, by its id.') }).strict(),
    },
    {
      name: 'notify',
      description:
        'Show a message to whoever saved this automation, on their screen, the moment it fires — a reminder, an alert, or that a timer is up. Shown only if they are connected then; if they are not, it is not shown later.',
      input: z.object({ text: z.string().min(1).describe('The message, in a few words.') }).strict(),
    },
  ];
};

// The deck's slide ids, from what a `slides/deck` read returned.
const SlideIdsSchema = z.array(z.object({ slide_id: z.string() }));
export const slideIdsOf = (rows: unknown): string[] => SlideIdsSchema.parse(rows ?? []).map((row) => row.slide_id);

// The local wall clock, "YYYY-MM-DDTHH:MM" (or to the second), in `tz` — what
// a date or a time of day in a request is read against.
const pad = (n: number): string => String(n).padStart(2, '0');
export const localNow = (instant: number, tz: string, seconds = false): string => {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}${seconds ? `:${pad(p.second)}` : ''}`;
};

// A draft's WHEN, before it is saved: a timer counts from the press, so it is
// said as a length; a clock as its time.
export const whenWords = (draft: ReflexDraft): string => {
  if ('timer' in draft.on) {
    const { hours = 0, minutes = 0, seconds = 0 } = draft.on.timer;
    const parts = [hours > 0 ? `${hours} h` : '', minutes > 0 ? `${minutes} min` : '', seconds > 0 ? `${seconds} s` : ''].filter((part) => part !== '');
    return `${parts.join(' ')} after you save`;
  }
  if ('clock' in draft.on) return 'every' in draft.on.clock ? `every ${draft.on.clock.every} at ${draft.on.clock.at}` : `fires at ${draft.on.clock.at.slice(11)}`;
  return '';
};

// When a timer next fires, from now — tide's own clock math.
export const dueOf = (reflex: Reflex, now: number): number | undefined =>
  'clock' in reflex.on ? occurrencesBetween(reflex.on.clock, now, now + 7 * 86_400_000, 1)[0]?.at : undefined;

// ── writing a timer ──

// What a draft may use HERE: lyceum feeds tide only the clock, so a draft is
// set off by a clock or a timer — the model is shown no other trigger.
export const DRAFT_HERE: DraftChoice = { triggers: ['clock', 'timer'] };
export const DraftHereSchema = draftSchemaOf(DRAFT_HERE);

// What the writer answered — a draft; a question back, when the request can be
// read more than one way; or a refusal, when no offered effect does it; never
// an invented reflex — and its reasoning, which the person is shown and which
// goes back to it with a reply or a correction.
export type Written = { answer: ReflexAnswer; reasoning: string | undefined };

// `facts`: what the host knows that the request may refer to — the deck, as the
// caller read it. Handed to the agent as context for this run. `slideIds`: the
// deck's slides, as rows — what the offered effect may name. `earlier`: this
// automation so far — the person's earlier words and what the writer answered
// each time, from their recorded turns (server/functions/assistant.functions.ts).
export type TimerRequest = {
  intent: string;
  now: number;
  tz: string;
  facts: string;
  slideIds: readonly string[];
  earlier: readonly { request: string; answer: ReflexAnswer; reasoning: string | undefined }[];
};

// What sets an automation off HERE, and how lyceum's timers behave — lyceum's,
// handed to the writer beside the deck. The draft's schema already offers only
// a clock or a timer; this line is kept anyway because it was MEASURED to
// matter (MEASURED.md, 2026-09-29: without it, the refusal of an email and the
// replies both got worse).
export const TRIGGERS_HERE =
  'Here, an automation can only be set off by the clock: a date and time, a repeating time of day, or a timer. Nothing here can fire it by hand or on an event. When only a timer is asked for, with nothing to do when it ends, it notifies the person.';
export type TimerWriter = { kind: 'live' | 'fake'; write: (request: TimerRequest) => Promise<Written> };

const liveWriter = (): TimerWriter => {
  const llm = createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
  return {
    kind: 'live',
    write: async ({ intent, now, tz, facts, slideIds, earlier }) => {
      const at = localNow(now, tz);
      // A reply or a correction goes to the agent as the conversation it belongs to.
      const input = earlier.length === 0 ? { intent, now: at, tz } : reflexConversation({ now: at, tz, earlier, latest: intent });
      const result = await createReflexAgent({ effects: timerEffects(slideIds), ...DRAFT_HERE }).run(input, { llm, producers: [() => facts, () => TRIGGERS_HERE] }).result;
      if (!result.ok) throw new Error(`The automation could not be written: ${result.error.message}`);
      return { answer: result.output.data, reasoning: result.output.reasoning ?? undefined };
    },
  };
};

// A deterministic stand-in, enough to drive every real path in a check — it
// measures nothing about a model. "email" is refused. "N minutes" is a timer
// that long — putting the closing slide up if the words name a slide,
// notifying otherwise. A correction naming a slide, after a draft, keeps that
// draft's trigger and puts the closing slide up. A reply to a question is a
// one-minute notification of the first request. Anything else is ASKED about.
const fakeWriter = (): TimerWriter => ({
  kind: 'fake',
  write: async ({ intent, slideIds, earlier }) => {
    const closing = { name: 'deck.show', input: { slideId: slideIds.at(-1) ?? '' } };
    if (/email/i.test(intent)) return { answer: { refused: 'Nothing here can send an email.' }, reasoning: 'An email: no offered effect sends one.' };
    const last = earlier.at(-1)?.answer;
    if (last !== undefined && isDraft(last) && /slide/i.test(intent)) {
      return { answer: DraftHereSchema.parse({ ...last, intent: 'Put the closing slide on screen.', effect: closing }), reasoning: 'A correction: the same time, the closing slide instead.' };
    }
    const minutes = /(\d+)\s*min/i.exec(intent)?.[1];
    if (minutes !== undefined) {
      const slide = /slide/i.test(intent);
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

// ── running the timers ──

// A reflex as it may be loaded: tide's schema, an effect this host offers with
// an input that effect accepts — a slide the deck holds now — and, whatever the
// document said, run as the clock. Throws, in words, otherwise.
export const armable = (document: unknown, slideIds: readonly string[]): Reflex => {
  const reflex = ReflexSchema.parse(document);
  const problem = effectProblem(timerEffects(slideIds), reflex);
  if (problem !== undefined) throw new Error(problem);
  return { ...reflex, as: 'clock' };
};

// A draft as it may be proposed: the draft lyceum offers, with an effect this
// host offers and an input it accepts. Who it runs as is not in it: saving
// stamps the clock (`armable`). Throws, in words.
export const proposable = (document: unknown, slideIds: readonly string[]): ReflexDraft => {
  const draft = DraftHereSchema.parse(document);
  const problem = effectProblem(timerEffects(slideIds), draft);
  if (problem !== undefined) throw new Error(problem);
  return draft;
};

// SAVING a proposed draft: anchored at `at` — the press — so a timer counts
// from then, to the second; its id is the row's, so an effect that marks its
// own row (`timer.ring`) finds it. What comes back is the reflex to store.
export const anchorTimer = (draft: ReflexDraft, timerId: string, at: number, tz: string, slideIds: readonly string[]): Reflex =>
  armable(anchorDraft({ ...draft, id: timerId }, { at, tz }), slideIds);

export type Timing = { tide: Tide; driver: TideDriver; reload: () => Promise<number>; stop: () => Promise<void> };

export const startTiming = async (server: MossServer, runtime: LyceumRuntime): Promise<Timing> => {
  // The clock's own session: its effects are its writes, through the same
  // governed door as anybody's, so the stage follows them like any other.
  const clock = vexOver(wireAs(server, await mintSession(runtime.pool, 'clock', 30 * 86_400_000)));
  // Who saved each loaded timer (timer_id → principal): whom `notify` shows its
  // message to. Filled by `reload`, from the rows.
  const savedBy = new Map<string, string>();

  const tide = createTide({
    store: createTideStore(runtime.pool),
    storeUnwatchedWrites: false,
    // Templates are Prism: evaluate checks a template the first time it is handed it.
    transform: evaluate,
    // A timer selects nothing: the clock firing is the whole unit.
    select: async () => {
      throw new Error('lyceum: a timer selects nothing');
    },
    effects: () => ({
      'deck.show': {
        writes: ['deck'],
        run: async (input: unknown) => clock(deckShow.fingerprint, { deck: TALK_DECK, slideId: z.object({ slideId: z.string() }).parse(input).slideId }),
      },
      // A message in the live shell of whoever saved the automation — by the
      // reflex's id, which saving made the row's. Only if a terminal of theirs
      // is attached NOW: a durable shell outlives its last connection (moss
      // keeps it for a while), and delivering into one nobody is looking at
      // would show the message later, which the description does not promise.
      // Either way tide's ledger records what came of it. It writes nothing.
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

  // Every saved timer, as the scheduler — the only role that reads them all —
  // held to the deck as it stands; and who saved each, for `notify`.
  const reload = async (): Promise<number> => {
    const rows = z.array(z.object({ timer_id: z.string(), reflex: z.unknown(), saved_by: z.string() })).parse(await server.executeAs('scheduler', timersAll.fingerprint, {}));
    savedBy.clear();
    for (const row of rows) savedBy.set(row.timer_id, row.saved_by);
    const slideIds = slideIdsOf(await server.executeAs('scheduler', slidesDeck.fingerprint, {}));
    const reflexes = rows.flatMap((row) => {
      try {
        return [armable(row.reflex, slideIds)];
      } catch (error) {
        console.error('[lyceum] a saved timer could not be loaded:', error instanceof Error ? error.message : error);
        return [];
      }
    });
    await tide.load(reflexes, { at: Date.now() });
    void driver.wake();
    return reflexes.length;
  };
  await reload();
  return {
    tide,
    driver,
    reload,
    // Resolves once nothing the driver started is still touching the store.
    stop: () => driver.stop(),
  };
};
