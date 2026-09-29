import { ReflexSchema } from '../schemas';
import type { Reflex, ReflexDraft, Timer } from '../schemas';
import { zonedParts } from './occurrence';

// ═══════════════════════════════════════════════════════════════
// Anchoring — a draft becomes a reflex when somebody saves it.
//
// A timer means "this long from now", and now is the moment of saving:
// time spent reading the draft is not taken off it. The timer is fixed to
// a one-shot clock at that instant plus its length, to the second, in the
// host's timezone — so what is stored names an instant, and a restart
// re-loads the same one. Any other trigger passes through unchanged.
// ═══════════════════════════════════════════════════════════════

export const timerMs = (timer: Timer): number => (((timer.hours ?? 0) * 60 + (timer.minutes ?? 0)) * 60 + (timer.seconds ?? 0)) * 1000;

const pad2 = (value: number): string => String(value).padStart(2, '0');

const localDateTime = (instant: number, tz: string): string => {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
};

export const anchorDraft = (draft: ReflexDraft, anchor: { at: number; tz: string }): Reflex => {
  if (!('timer' in draft.on)) return ReflexSchema.parse(draft);
  // A clock names whole seconds, so the instant is rounded — UP: a timer may
  // run a fraction of a second long, never short.
  const fires = Math.ceil((anchor.at + timerMs(draft.on.timer)) / 1000) * 1000;
  return ReflexSchema.parse({ ...draft, on: { clock: { at: localDateTime(fires, anchor.tz), tz: anchor.tz } } });
};
