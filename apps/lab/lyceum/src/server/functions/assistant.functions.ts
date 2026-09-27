import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FunctionHandler } from '@niscorp/nova';
import { armable, dueOf, localNow } from '../timing';
import type { TimerWriter, Timing } from '../timing';

// THE SPEAKER'S ASSISTANT, first form: ask for an automation in words; get the
// document back to read; save it. Two functions, for the two things that are
// not data (PLAN.md, "Vex is never hidden behind a function"):
//
//   assistant.propose  a model's choice — the reflex agent writes the timer.
//                      Returned, never saved: the speaker reads it first.
//   timers.arm         loading the saved timers into tide — the running
//                      engine, not a table.
//
// Saving is neither: it is the speaker's own vex write (`timers/save`), made
// by the action itself between the two.

const DraftSchema = z.object({ draft: z.string() });

export const assistantFunctions = (writer: TimerWriter, tz: string, timing: () => Timing): Record<string, FunctionHandler> => ({
  'assistant.propose': async (data) => {
    const intent = DraftSchema.parse(data).draft.trim();
    if (intent === '') throw new Error('Ask for something first — "end the talk in 30 minutes".');
    const now = Date.now();
    // The host's word on the document, before anybody reads it: tide's schema,
    // an offered effect with an input it accepts, and run as the clock.
    const reflex = armable(await writer.write(intent, now, tz));
    const due = dueOf(reflex, now);
    return {
      timerId: `${reflex.id}-${randomBytes(3).toString('hex')}`,
      reflex,
      json: JSON.stringify(reflex, null, 2),
      intent: reflex.intent,
      dueAt: due === undefined ? null : new Date(due).toISOString(),
      dueLocal: due === undefined ? '' : localNow(due, tz).slice(11),
    };
  },
  'timers.arm': async () => ({ armed: await timing().reload() }),
});
