import { z } from 'zod';
import { createTide, occurrencesBetween, ReflexSchema, zonedParts } from '@niscorp/tide';
import type { Reflex, Tide } from '@niscorp/tide';
import { createReflexAgent, effectProblem } from '@niscorp/tide/agent';
import type { OfferedEffect } from '@niscorp/tide/agent';
import { ConfigSchema, evaluate } from '@niscorp/prism';
import { createSignal } from '@niscorp/signal';
import { createTideDriver, createTideStore, mintSession } from '@niscorp/moss';
import type { MossServer, TideDriver } from '@niscorp/moss';
import { deckShow } from '@lyceum/app/vex/deck.entries';
import { timersAll } from '@lyceum/app/vex/timer.entries';
import { DECK_ID, SLIDES } from '@lyceum/db/seed';
import { vexOver, wireAs } from './vex-over';
import type { LyceumRuntime } from './runtime';

// THE TALK'S TIMERS. The speaker asks their assistant for one — "end the talk
// in thirty minutes" — and a model writes it: a tide REFLEX, the automation as
// a document. The speaker reads it and saves it; from then on it runs with no
// model at all. That is the contrast the talk draws: an agent that re-reads
// its instructions on every tick versus one that writes the automation once.
//
//   WRITING  the reflex agent (@niscorp/tide/agent) on gpt-oss-120b, handed the
//            effects offered here — or, LYCEUM_TIMER=fake, a deterministic
//            stand-in that reads "in N minutes" (the checks, a talk with no
//            network). Unset: live with a Groq key, fake without.
//   RUNNING  tide on moss's durable store, woken by moss's driver. Every saved
//            timer is a row (`timers`), loaded at boot as the `scheduler`
//            machinery role and on every save. Each runs AS the `clock`
//            principal, whose one grant is putting a slide on screen — the host
//            stamps that, never the model.

// The talk happens somewhere; its clocks are that place's.
export const talkZone = (env: Record<string, string | undefined>): string => env['LYCEUM_TZ'] ?? 'Europe/Vienna';

// What a timer may do: the host's vocabulary, offered to the model with the
// schema of its input. One effect, because the talk's clock needs one.
const SLIDE_IDS = SLIDES.map((slide) => slide.slideId);
export const TIMER_EFFECTS: readonly OfferedEffect[] = [
  {
    name: 'deck.show',
    does: `Put a slide on the projector. The talk's slides, in order: ${SLIDE_IDS.join(', ')} — the talk ends on the last one.`,
    input: z.object({ slideId: z.enum(SLIDE_IDS).describe('The slide to put on screen.') }).strict(),
  },
];

// The local wall clock, "YYYY-MM-DDTHH:MM", in `tz` — what "in thirty
// minutes" counts from.
const pad = (n: number): string => String(n).padStart(2, '0');
export const localNow = (instant: number, tz: string): string => {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
};

// When a timer next fires, from now — tide's own clock math.
export const dueOf = (reflex: Reflex, now: number): number | undefined =>
  'clock' in reflex.on ? occurrencesBetween(reflex.on.clock, now, now + 7 * 86_400_000, 1)[0]?.at : undefined;

// ── writing a timer ──

export type TimerWriter = { kind: 'live' | 'fake'; write: (intent: string, now: number, tz: string) => Promise<Reflex> };

const liveWriter = (): TimerWriter => {
  const llm = createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
  const agent = createReflexAgent({ effects: TIMER_EFFECTS });
  return {
    kind: 'live',
    write: async (intent, now, tz) => {
      const result = await agent.run({ intent, now: localNow(now, tz), tz }, { llm }).result;
      if (!result.ok) throw new Error(`The assistant could not write that timer: ${result.error.message}`);
      return result.output.data;
    },
  };
};

// "in 30 minutes", "in an hour" → a one-shot clock that far from now, closing
// the talk. Enough to drive the real path in a check.
const fakeWriter = (): TimerWriter => ({
  kind: 'fake',
  write: async (intent, now, tz) => {
    const minutes = /(\d+)\s*min/i.exec(intent)?.[1] ?? (/an hour/i.test(intent) ? '60' : '30');
    return ReflexSchema.parse({
      id: `timer-${minutes}m`,
      intent: `Put the closing slide on screen in ${minutes} minutes.`,
      on: { clock: { at: localNow(now + Number(minutes) * 60_000, tz), tz } },
      effect: { name: 'deck.show', input: { slideId: SLIDE_IDS.at(-1) ?? '' } },
    });
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
// an input that effect accepts, and — whatever the document said — run as the
// clock. Throws, in words, otherwise.
export const armable = (document: unknown): Reflex => {
  const reflex = ReflexSchema.parse(document);
  const problem = effectProblem(TIMER_EFFECTS, reflex);
  if (problem !== undefined) throw new Error(problem);
  return { ...reflex, as: 'clock' };
};

export type Timing = { tide: Tide; driver: TideDriver; reload: () => Promise<number>; stop: () => Promise<void> };

export const startTiming = async (server: MossServer, runtime: LyceumRuntime): Promise<Timing> => {
  // The clock's own session: its effects are its writes, through the same
  // governed door as anybody's, so the stage follows them like any other.
  const clock = vexOver(wireAs(server, await mintSession(runtime.pool, 'clock', 30 * 86_400_000)));

  const tide = createTide({
    store: createTideStore(runtime.pool),
    storeUnwatchedWrites: false,
    // Templates are Prism; both sides are parsed at the boundary.
    transform: (config, source) => evaluate(ConfigSchema.parse(config), z.json().parse(source)),
    // A timer selects nothing: the clock firing is the whole unit.
    select: async () => {
      throw new Error('lyceum: a timer selects nothing');
    },
    effects: () => ({
      'deck.show': {
        writes: ['deck'],
        run: async (input: unknown) => clock(deckShow.fingerprint, { deck: DECK_ID, slideId: z.object({ slideId: z.string() }).parse(input).slideId }),
      },
    }),
    actor: (as) => as,
  });
  const driver = createTideDriver({ tide });
  // The drain the last reload started — awaited on stop, so nothing is still
  // writing when the database closes (the driver's own stop does not wait).
  let draining: Promise<void> = Promise.resolve();

  // Every saved timer, as the scheduler — the only role that reads them all.
  const reload = async (): Promise<number> => {
    const rows = z.array(z.object({ reflex: z.unknown() })).parse(await server.executeAs('scheduler', timersAll.fingerprint, {}));
    const reflexes = rows.flatMap((row) => {
      try {
        return [armable(row.reflex)];
      } catch (error) {
        console.error('[lyceum] a saved timer could not be loaded:', error instanceof Error ? error.message : error);
        return [];
      }
    });
    await tide.load(reflexes, { at: Date.now() });
    draining = driver.wake();
    return reflexes.length;
  };
  await reload();
  return {
    tide,
    driver,
    reload,
    stop: async () => {
      driver.stop();
      await draining;
    },
  };
};
