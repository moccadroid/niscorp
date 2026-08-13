import { checkInsTodayCount, membersActiveCount, studioCurrent } from '@lyra/app/vex/studio.entries';
import { revenueExpected } from '@lyra/app/vex/forecast.entries';
import { sessionsToday } from '@lyra/app/vex/schedule.entries';

export const studioPrism = { fingerprint: studioCurrent.fingerprint, context: {} };
export const memberCountPrism = { fingerprint: membersActiveCount.fingerprint, context: {} };
export const revenuePrism = { fingerprint: revenueExpected.fingerprint, context: {} };

export const checkInsPrism = { fingerprint: checkInsTodayCount.fingerprint, context: {} };
export const sessionsTodayPrism = { fingerprint: sessionsToday.fingerprint, context: {} };
