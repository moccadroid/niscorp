import { checkInsTodayCount, membersActiveCount, studioCurrent } from '@lyra/app/vex/studio.entries';
import { revenueExpected } from '@lyra/app/vex/forecast.entries';
import { sessionsToday } from '@lyra/app/vex/schedule.entries';

// The endpoint bodies. A vex replay is `{ fingerprint, context }` and nothing
// more — no shape, no intent on the wire.
//
// `$.today` is ambient: moss folds it into the transform source per request,
// alongside `$.userId`, so a query never reads a wall clock and a request can
// never author the date. Note what is NOT here: a studio id. The engine
// supplies it from the caller's scope, unforgeably (behaviors.ts).

export const studioPrism = { fingerprint: studioCurrent.fingerprint, context: {} };
export const memberCountPrism = { fingerprint: membersActiveCount.fingerprint, context: {} };
export const revenuePrism = { fingerprint: revenueExpected.fingerprint, context: {} };

export const checkInsPrism = { fingerprint: checkInsTodayCount.fingerprint, context: {} };
export const sessionsTodayPrism = { fingerprint: sessionsToday.fingerprint, context: {} };
