import { programsList, sessionsUpcoming } from '@lyra/app/vex/schedule.entries';

// FOUR WEEKS OF CLASSES, AND THIS SENDS NOTHING.
//
// Both ends of the window are scope now — `today` and `horizon`, stamped by the
// engine from the studio's own clock. The caller used to compute the far end
// with `$dateAdd` over moss's ambient `$.today`, which meant one query spanned
// two different clocks and could be a day long or short at the end.
//
// An empty context is the strongest version of "a request cannot widen this":
// there is no argument to tamper with.
//
// Four weeks rather than two because stepping through weeks is only navigation
// if there is somewhere to step to, and four rather than five because four is
// what the generator keeps ahead of an open-ended slot — asking for a fifth
// would return a blank week and blame the calendar.
export const upcomingPrism = { fingerprint: sessionsUpcoming.fingerprint, context: {} };

export const programsPrism = { fingerprint: programsList.fingerprint, context: {} };
