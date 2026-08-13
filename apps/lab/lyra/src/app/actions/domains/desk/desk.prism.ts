import { sessionsToday } from '@lyra/app/vex/schedule.entries';
import { checkInMark, rosterForSession, walkInsToday } from '@lyra/app/vex/desk.entries';

export const sessionsTodayPrism = { fingerprint: sessionsToday.fingerprint, context: {} };
export const walkInsPrism = { fingerprint: walkInsToday.fingerprint, context: {} };

export const rosterPrism = {
  fingerprint: rosterForSession.fingerprint,
  context: { sessionId: { $ref: '$.selectedSessionId' } },
};

// Who and which class. Not when — the database defaults that — and not which
// studio, which the engine stamps.
export const checkInPrism = {
  fingerprint: checkInMark.fingerprint,
  context: {
    personId: { $ref: '$.pendingPersonId' },
    sessionId: { $ref: '$.selectedSessionId' },
    bookingId: { $ref: '$.pendingBookingId' },
  },
};
