// ═══════════════════════════════════════════════════════════════
// THE STUDIO'S DAY — the whole of the clock, and the one piece of held state
// in this directory that is not scheduled for deletion.
//
// It lived in `users.ts` because that is where the timezone map was. That was
// the accident: the directory happened to have loaded the zones, so the clock
// grew next to them, and by the time anybody asked where the clock lived the
// answer was "inside identity" — which is why `Directory` reached thirteen
// methods without anybody deciding it should (docs/plans/lyra-identity.md 2.2).
//
// So it gets its own file, and `identity.ts` takes the clock from here rather
// than from the directory it replaced. That is decision D9.
//
// WHY THE MEMO BELOW IS NOT THE DISEASE, spelled out because a rule sharp
// enough to catch the directory would otherwise condemn it:
//
//   - it is keyed by an IANA timezone, so its key space is bounded by a
//     standard rather than by how many people sign up;
//   - dropping it loses no information, only speed (invariant 3);
//   - nothing in it came from a query result, which is the discriminator
//     `held-state-check` actually applies.
//
// It earns its place: constructing an `Intl.DateTimeFormat` dominates this
// function, and the request path reaches it on every request by design — the
// day is volatile and must never be held for the length of a session.
// ═══════════════════════════════════════════════════════════════

const DAY_FORMAT: Record<string, Intl.DateTimeFormat> = {};

/** The day it is in a ZONE, as YYYY-MM-DD.
 *
 *  `en-CA` because it formats exactly that way, which is what a DATE column
 *  compares against. Computing an offset by hand is how a calendar ends up a
 *  day out twice a year, and the database computes the same value in
 *  `studio_today()` — `clock-check` asserts the two halves agree. */
export const dayIn = (timezone: string): string =>
  (DAY_FORMAT[timezone] ??= new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })).format(new Date());

/** Four weeks out from a given day — how far ahead a read looks.
 *
 *  Takes the DAY rather than the studio, so a caller that has already resolved
 *  one does not resolve it twice. */
export const horizonFrom = (today: string): string =>
  today === '' ? '' : new Date(Date.parse(`${today}T00:00:00Z`) + 27 * 86_400_000).toISOString().slice(0, 10);

/** The volatile half of a principal's scope values, derived from the zone the
 *  resolved identity already carries. No lookup, no cache, no row. */
export const clockScope = (timezone: string): Record<string, unknown> =>
  timezone === '' ? { today: '', horizon: '' } : (() => {
    const today = dayIn(timezone);
    return { today, horizon: horizonFrom(today) };
  })();
