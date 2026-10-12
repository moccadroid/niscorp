import { z } from 'zod';

export const DaySchema = z.enum(['fri', 'sat', 'sun']);
export type Day = z.infer<typeof DaySchema>;

export const DAYS: readonly Day[] = ['fri', 'sat', 'sun'];

export type FestivalClock = {
  day: Day;
  hour: number;
  time: string;
};

export const PINNED_CLOCK: FestivalClock = { day: 'sat', hour: 18, time: '18:00' };

export const dayAfter = (day: Day): Day => DAYS[Math.min(DAYS.indexOf(day) + 1, DAYS.length - 1)] ?? day;
