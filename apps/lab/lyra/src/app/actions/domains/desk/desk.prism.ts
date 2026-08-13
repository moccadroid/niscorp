import { sessionsToday } from '@lyra/app/vex/schedule.entries';
import { bookableForSession, bookingCreate, checkInMark, rosterForSession, walkInsToday } from '@lyra/app/vex/desk.entries';

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

// ── the walk-in half, wired at last ──────────────────────────
// Who could still join the chosen class: live access, no booking yet. The
// read sat here for two reviews with nothing calling it.
export const bookablePrism = {
  fingerprint: bookableForSession.fingerprint,
  context: { sessionId: { $ref: '$.selectedSessionId' } },
};

// Books the picked person into the picked class; the check-in that follows
// rides the same pending keys a roster tap uses.
export const walkInBookPrism = {
  fingerprint: bookingCreate.fingerprint,
  context: { sessionId: { $ref: '$.selectedSessionId' }, personId: { $ref: '$.walkInPersonId' } },
};
