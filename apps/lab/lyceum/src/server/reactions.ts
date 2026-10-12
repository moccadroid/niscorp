import type { MossServer, NiscApp } from '@niscorp/moss';
import { GRANT_CHANGES } from '@lyceum/app/vex/grant.entries';
import { STAFF } from '@lyceum/db/seed';
import type { Moderation } from './moderation';

export const lyceumReactions = (server: () => MossServer, moderation: Moderation): NonNullable<NiscApp['reactions']> => [
  { table: 'questions', op: 'insert', run: () => moderation.judgeQuestions() },
  {
    table: 'deck',
    run: (_event, tools) => {
      for (const shell of server().shells?.list() ?? []) tools.deliver(shell.principal, 'deck-moved');
    },
  },
  // A reaction hears that the rows changed, not whose, so every member's shell
  // is rebuilt; the staff are never given anything and keep theirs.
  {
    table: 'grants',
    run: (event) => {
      if (!GRANT_CHANGES.includes(event.fingerprint ?? '')) return;
      const staff = new Set(STAFF.map((principal) => principal.principal));
      for (const shell of server().shells?.list() ?? []) if (!staff.has(shell.principal)) server().invalidateIdentity(shell.principal);
    },
  },
];
