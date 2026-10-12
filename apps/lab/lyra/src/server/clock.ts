const DAY_FORMAT: Record<string, Intl.DateTimeFormat> = {};

/** `en-CA` formats a date as YYYY-MM-DD, which is what a DATE column compares
 *  against. The database computes the same day in `studio_today()`. */
export const dayIn = (timezone: string): string =>
  (DAY_FORMAT[timezone] ??= new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })).format(new Date());

export const horizonFrom = (today: string): string =>
  today === '' ? '' : new Date(Date.parse(`${today}T00:00:00Z`) + 27 * 86_400_000).toISOString().slice(0, 10);

export const clockScope = (timezone: string): Record<string, unknown> =>
  timezone === '' ? { today: '', horizon: '' } : (() => {
    const today = dayIn(timezone);
    return { today, horizon: horizonFrom(today) };
  })();
