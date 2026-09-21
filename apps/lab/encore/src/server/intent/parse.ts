import { dayAfter } from '@encore/lib/festival-clock';
import type { Day, FestivalClock } from '@encore/lib/festival-clock';
import type { Parsed } from './intent.types';

// LANE 1 — PARSE. Deterministic, local, free.
//
// Dates, times, durations and amounts are READ, never judged: "at 9" is not a
// thing a model should be trusted to have an opinion about, and a parser cannot
// hallucinate a time that was not typed. Whatever this lane consumes is removed
// from the words that go looking for rows — "9" must not search for an act.
//
// Each reader takes the text, returns what it found and the text WITHOUT it, so
// the order below is the precedence: "20 min" is a duration before "20" can be
// an hour, and "21:00" is a time before "21" can be an amount.

type Reading<T> = { value: T | undefined; rest: string };

// Function words, plus the ones that only exist to introduce a value ("at 9",
// "by 20 min"). Candidate retrieval is an `ilike`, and `%the%` finds everything.
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'at', 'in', 'on', 'for', 'with', 'by', 'to', 'from', 'into', 'onto', 'is', 'it', 'its', 'this', 'that',
  'be', 'as', 'are', 'was', 'we', 'i', 'me', 'my', 'our', 'us', 'them', 'they', 'please', 'until', 'till', 'around', 'about', 'than', 'then',
]);

// A prefix shorter than this matches too much to be a search.
const MIN_TOKEN_LENGTH = 3;

const DAY_WORDS: Record<string, Day> = { fri: 'fri', friday: 'fri', sat: 'sat', saturday: 'sat', sun: 'sun', sunday: 'sun' };

const pad = (value: number): string => String(value).padStart(2, '0');

const consume = (text: string, match: RegExpExecArray): string => `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;

// "20 min", "20mins", "90 minutes", "1 hour", "2h".
const readMinutes = (text: string): Reading<number> => {
  const match = /\b(\d{1,3})\s*(minutes|minute|mins|min|hours|hour|hrs|hr|h|m)\b/.exec(text);
  if (match === null) return { value: undefined, rest: text };
  const amount = Number(match[1]);
  const isHours = (match[2] ?? '').startsWith('h');
  return { value: isHours ? amount * 60 : amount, rest: consume(text, match) };
};

// A BARE HOUR IS AN EVENING HOUR. The programme runs from noon to a 23:45
// curfew, so nobody in the ops tent says "at 9" and means the morning: 1–11
// with no meridiem reads as PM. An explicit "9am" is still 09:00.
const hourOf = (raw: number, meridiem: string | undefined): number | undefined => {
  if (raw > 23) return undefined;
  if (meridiem === 'am') return raw === 12 ? 0 : raw;
  if (meridiem === 'pm') return raw < 12 ? raw + 12 : raw;
  return raw >= 1 && raw <= 11 ? raw + 12 : raw;
};

// "21:00", "9pm", "9 pm", and the bare "9".
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

// A day by name, or relative to the festival's own clock — never the wall's.
const readDay = (text: string, clock: FestivalClock): Reading<Day> => {
  const relative = /\b(today|tonight|tomorrow)\b/.exec(text);
  if (relative !== null) return { value: relative[1] === 'tomorrow' ? dayAfter(clock.day) : clock.day, rest: consume(text, relative) };
  const named = /\b(friday|saturday|sunday|fri|sat|sun)\b/.exec(text);
  if (named === null) return { value: undefined, rest: text };
  return { value: DAY_WORDS[named[1] ?? ''], rest: consume(text, named) };
};

// Whatever number is still standing: "€500", "comp 40 tickets".
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
