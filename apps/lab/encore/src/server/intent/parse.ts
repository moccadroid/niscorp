import { dayAfter } from '@encore/lib/festival-clock';
import type { Day, FestivalClock } from '@encore/lib/festival-clock';
import type { Parsed } from './intent.types';

// Each reader returns the text without what it consumed, so the order in `parseLine` is the
// precedence: "20 min" is a duration before "20" can be an hour.

type Reading<T> = { value: T | undefined; rest: string };

export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'at', 'in', 'on', 'for', 'with', 'by', 'to', 'from', 'into', 'onto', 'is', 'it', 'its', 'this', 'that',
  'be', 'as', 'are', 'was', 'we', 'i', 'me', 'my', 'our', 'us', 'them', 'they', 'please', 'until', 'till', 'around', 'about', 'than', 'then',
]);

const MIN_TOKEN_LENGTH = 3;

const DAY_WORDS: Record<string, Day> = { fri: 'fri', friday: 'fri', sat: 'sat', saturday: 'sat', sun: 'sun', sunday: 'sun' };

const pad = (value: number): string => String(value).padStart(2, '0');

const consume = (text: string, match: RegExpExecArray): string => `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;

const readMinutes = (text: string): Reading<number> => {
  const match = /\b(\d{1,3})\s*(minutes|minute|mins|min|hours|hour|hrs|hr|h|m)\b/.exec(text);
  if (match === null) return { value: undefined, rest: text };
  const amount = Number(match[1]);
  const isHours = (match[2] ?? '').startsWith('h');
  return { value: isHours ? amount * 60 : amount, rest: consume(text, match) };
};

// The programme runs from noon to a 23:45 curfew, so a bare 1–11 reads as PM.
const hourOf = (raw: number, meridiem: string | undefined): number | undefined => {
  if (raw > 23) return undefined;
  if (meridiem === 'am') return raw === 12 ? 0 : raw;
  if (meridiem === 'pm') return raw < 12 ? raw + 12 : raw;
  return raw >= 1 && raw <= 11 ? raw + 12 : raw;
};

const readTime = (text: string): Reading<{ time: string; hour: number }> => {
  const clock = /\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/.exec(text);
  if (clock !== null) {
    const hour = hourOf(Number(clock[1]), clock[3]);
    const minute = Number(clock[2]);
    if (hour !== undefined && minute < 60) return { value: { time: `${pad(hour)}:${pad(minute)}`, hour }, rest: consume(text, clock) };
  }
  const spoken = /\b(\d{1,2})\s*(am|pm)\b/.exec(text) ?? /\b(\d{1,2})\b/.exec(text);
  if (spoken === null) return { value: undefined, rest: text };
  const hour = hourOf(Number(spoken[1]), spoken[2]);
  if (hour === undefined) return { value: undefined, rest: text };
  return { value: { time: `${pad(hour)}:00`, hour }, rest: consume(text, spoken) };
};

const readDay = (text: string, clock: FestivalClock): Reading<Day> => {
  const relative = /\b(today|tonight|tomorrow)\b/.exec(text);
  if (relative !== null) return { value: relative[1] === 'tomorrow' ? dayAfter(clock.day) : clock.day, rest: consume(text, relative) };
  const named = /\b(friday|saturday|sunday|fri|sat|sun)\b/.exec(text);
  if (named === null) return { value: undefined, rest: text };
  return { value: DAY_WORDS[named[1] ?? ''], rest: consume(text, named) };
};

const readAmount = (text: string): Reading<number> => {
  const match = /[€$£]?\b(\d+(?:\.\d+)?)\b/.exec(text);
  if (match === null) return { value: undefined, rest: text };
  return { value: Number(match[1]), rest: consume(text, match) };
};

export const parseLine = (line: string, clock: FestivalClock): Parsed => {
  const minutes = readMinutes(line.toLowerCase());
  const time = readTime(minutes.rest);
  const day = readDay(time.rest, clock);
  const amount = readAmount(day.rest);

  const tokens = amount.rest
    .split(/[^a-z0-9&]+/)
    .filter((word) => word.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(word) && !/^\d+$/.test(word));

  return {
    ...(time.value !== undefined ? { time: time.value.time, hour: time.value.hour } : {}),
    ...(day.value !== undefined ? { day: day.value } : {}),
    ...(minutes.value !== undefined ? { minutes: minutes.value } : {}),
    ...(amount.value !== undefined ? { amount: amount.value } : {}),
    tokens: [...new Set(tokens)],
  };
};
