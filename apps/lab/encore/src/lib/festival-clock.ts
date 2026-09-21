import { z } from 'zod';

// THE FESTIVAL'S CLOCK, PINNED.
//
// The seed is a regression fixture, not a demo that has to look alive today, so
// "now" is a fact of the fixture: Saturday, six in the evening, three and a
// half hours before the headliner and three before the storm cell. Every
// relative word the operator types — today, tonight, tomorrow — resolves
// against this, and it is handed in wherever it is needed. Nothing reads the
// wall clock: a check that passes on a Saturday must pass on a Tuesday.

export const DaySchema = z.enum(['fri', 'sat', 'sun']);
export type Day = z.infer<typeof DaySchema>;

export const DAYS: readonly Day[] = ['fri', 'sat', 'sun'];

export type FestivalClock = {
  day: Day;
  hour: number;
  time: string;
};

export const PINNED_CLOCK: FestivalClock = { day: 'sat', hour: 18, time: '18:00' };

// The day after, or the last day again — a festival has no Monday.
export const dayAfter = (day: Day): Day => DAYS[Math.min(DAYS.indexOf(day) + 1, DAYS.length - 1)] ?? day;
