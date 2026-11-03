const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_WORDS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

type Day = { y: number; m: number; d: number };

const pad = (n: number): string => String(n).padStart(2, '0');
// The date a text begins with, or undefined for one that does not exist ("2026-02-30").
const dayOf = (text: string): Day | undefined => {
  const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (found === null) return undefined;
  const day = { y: Number(found[1]), m: Number(found[2]), d: Number(found[3]) };
  const at = new Date(Date.UTC(day.y, day.m - 1, day.d));
  return at.getUTCFullYear() === day.y && at.getUTCMonth() === day.m - 1 && at.getUTCDate() === day.d ? day : undefined;
};
// Monday is 0: a week starts on Monday.
const weekdayOf = (day: Day): number => (new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay() + 6) % 7;
const plus = (day: Day, days: number): Day => {
  const at = new Date(Date.UTC(day.y, day.m - 1, day.d + days));
  return { y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: at.getUTCDate() };
};
const isoOf = (day: Day): string => `${String(day.y)}-${pad(day.m)}-${pad(day.d)}`;
const said = (day: Day): string => `${WEEKDAYS[weekdayOf(day)] ?? ''} ${isoOf(day)}`;
const days = (from: Day, first: number, last: number): string =>
  Array.from({ length: Math.max(0, last - first + 1) }, (_, at) => said(plus(from, first + at))).join(', ') || 'none';

// One month on one line, each weekday once with its days.
const monthLine = (y: number, m: number): string => {
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byWeekday = WEEKDAYS.map((): number[] => []);
  for (let d = 1; d <= length; d++) byWeekday[weekdayOf({ y, m, d })]?.push(d);
  return `${MONTHS[m - 1] ?? ''} ${String(y)}: ${WEEKDAYS.map((weekday, at) => `${weekday} ${(byWeekday[at] ?? []).join(' ')}`).join(' | ')}`;
};

// What the agent reads a date off, written from the `now` it is handed: today with its weekday, the rest of this week
// and the two after it, and this month and the next. A `now` that is no date and time says so instead.
export const whenItIs = (now: string): string => {
  const today = dayOf(now);
  const time = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d/.test(now) ? now.slice(11, 16) : undefined;
  if (today === undefined || time === undefined) return 'TODAY — not known: ask for the date of anything not given as one.';
  const toSunday = 6 - weekdayOf(today);
  const next = today.m === 12 ? { y: today.y + 1, m: 1 } : { y: today.y, m: today.m + 1 };
  return [
    `TODAY — ${said(today)}, ${time}.`,
    `COMING DAYS — today: ${said(today)} | the rest of this week: ${days(today, 1, toSunday)} | next week: ${days(today, toSunday + 1, toSunday + 7)} | ` +
      `the week after: ${days(today, toSunday + 8, toSunday + 14)}`,
    `CALENDAR — ${monthLine(today.y, today.m)}; ${monthLine(next.y, next.m)}`,
  ].join('\n');
};

// A weekday, as a word or abbreviated, then a date: "Fri 2026-11-06", "Friday, 2026-11-06T14:30", "thurs 2026-11-05".
const PAIRED = /\b(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|s|nesday|rsday|rs|urday)?\.?,?\s+(\d{4}-\d{2}-\d{2})(?!\d)/gi;

// What is sent back: a date the reasoning writes beside the wrong weekday, or a date that does not exist. How the
// reasoning words a date is its own: a draft is never sent back for that.
export const dateProblems = (reasoning: string | undefined): string[] => {
  const found = [...(reasoning ?? '').matchAll(PAIRED)].map((match) => ({
    text: match[2] ?? '',
    day: dayOf(match[2] ?? ''),
    named: WEEKDAYS.findIndex((weekday) => weekday.toLowerCase() === (match[1] ?? '').toLowerCase()),
  }));
  const none = found.flatMap(({ text, day }) => (day === undefined ? [`${text} is not a date. Look the date up in COMING DAYS or CALENDAR.`] : []));
  const pairs = found.flatMap(({ day, named }) => (day === undefined || named < 0 ? [] : [{ day, named }]));
  const wrong = pairs.flatMap(({ day, named }) => {
    const real = weekdayOf(day);
    if (real === named) return [];
    const after = plus(day, (named - real + 7) % 7);
    return [
      `${isoOf(day)} is a ${WEEKDAY_WORDS[real] ?? ''}, not a ${WEEKDAY_WORDS[named] ?? ''}: the ${WEEKDAY_WORDS[named] ?? ''}s around it are ` +
        `${said(plus(after, -7))} and ${said(after)}. Look the date up in COMING DAYS.`,
    ];
  });
  return [...none, ...wrong];
};
