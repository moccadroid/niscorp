import { programsList, sessionsUpcoming } from '@lyra/app/vex/schedule.entries';
import { localeCurrent } from '@lyra/app/vex/theme.entries';

export const upcomingPrism = { fingerprint: sessionsUpcoming.fingerprint, context: {} };

export const programsPrism = { fingerprint: programsList.fingerprint, context: {} };

// The studio's language, for the calendar. It is the one component that has to
// FORMAT a date rather than be handed one — it lays out every day in the range,
// and the empty days have no row to carry a label — so it needs the tag.
export const localePrism = { fingerprint: localeCurrent.fingerprint, context: {} };
