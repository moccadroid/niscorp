import { programsList, sessionsUpcoming } from '@lyra/app/vex/schedule.entries';
import { localeCurrent } from '@lyra/app/vex/theme.entries';

export const upcomingPrism = { fingerprint: sessionsUpcoming.fingerprint, context: {} };

export const programsPrism = { fingerprint: programsList.fingerprint, context: {} };

export const localePrism = { fingerprint: localeCurrent.fingerprint, context: {} };
