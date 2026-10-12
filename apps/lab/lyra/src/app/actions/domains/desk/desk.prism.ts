import { sessionsToday } from '@lyra/app/vex/schedule.entries';
import { bookableForSession, bookingCreate, checkInMark, rosterForSession, walkInsToday } from '@lyra/app/vex/desk.entries';

export const sessionsTodayPrism = { fingerprint: sessionsToday.fingerprint, context: {} };
export const walkInsPrism = { fingerprint: walkInsToday.fingerprint, context: {} };

export const rosterPrism = {
  fingerprint: rosterForSession.fingerprint,
  context: { sessionId: { $ref: '$.selectedSessionId' } },
};

export const checkInPrism = {
  fingerprint: checkInMark.fingerprint,
  context: {
    personId: { $ref: '$.pendingPersonId' },
    sessionId: { $ref: '$.selectedSessionId' },
    bookingId: { $ref: '$.pendingBookingId' },
  },
};

export const bookablePrism = {
  fingerprint: bookableForSession.fingerprint,
  context: { sessionId: { $ref: '$.selectedSessionId' } },
};

export const walkInBookPrism = {
  fingerprint: bookingCreate.fingerprint,
  context: { sessionId: { $ref: '$.selectedSessionId' }, personId: { $ref: '$.walkInPersonId' } },
};
