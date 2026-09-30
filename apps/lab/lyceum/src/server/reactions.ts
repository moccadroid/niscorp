import type { MossServer, NiscApp } from '@niscorp/moss';
import { xrayGive, xrayTake } from '@lyceum/app/vex/grant.entries';
import { STAFF } from '@lyceum/db/seed';
import type { Moderation } from './moderation';

// THE DECK MOVED — a signal, not data. A slide is an action, and putting a new
// one on the stage's canvas is a navigation no data update can make, so the
// stage has to be told. Told as a channel with no rows: every living shell
// hears `deck-moved`, and only the stage's deck listens; it re-reads the row
// under its own policy and mounts that slide. (Reads that only DISPLAY the deck
// — the controller's "slide 3 / 6" — are reactive and need none of this.)
export const lyceumReactions = (server: () => MossServer, moderation: Moderation): NonNullable<NiscApp['reactions']> => [
  // A QUESTION WAS SENT: the moderator judges what it has not judged yet
  // (./moderation.ts). Until it has, the question is on nobody's screen but its
  // sender's; judged fit, the controller's list shows it on its own (reactive).
  { table: 'questions', op: 'insert', run: () => moderation.judgeQuestions() },
  {
    table: 'deck',
    run: (_event, tools) => {
      for (const shell of server().shells?.list() ?? []) tools.deliver(shell.principal, 'deck-moved');
    },
  },
  // SOMETHING WAS GIVEN OR TAKEN BACK — the speaker wrote or deleted grant
  // rows (vex/grant.entries.ts). What a person has is their roles, resolved
  // when their shell is built; so every member's live shell is rebuilt and
  // resolves again, and the given action exists on it or does not. A reaction
  // hears THAT the rows changed, not whose, so every member is rebuilt — the
  // staff (the speaker, the stage) are never given anything and keep theirs.
  {
    table: 'grants',
    run: (event) => {
      if (event.fingerprint !== xrayGive.fingerprint && event.fingerprint !== xrayTake.fingerprint) return;
      const staff = new Set(STAFF.map((principal) => principal.principal));
      for (const shell of server().shells?.list() ?? []) if (!staff.has(shell.principal)) server().invalidateIdentity(shell.principal);
    },
  },
];
