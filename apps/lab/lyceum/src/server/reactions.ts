import type { MossServer, NiscApp } from '@niscorp/moss';
import { GRANT_CHANGES } from '@lyceum/app/vex/grant.entries';
import { MEMBERS } from './identity';
import type { Moderation } from './moderation';

export const lyceumReactions = (server: () => MossServer, moderation: Moderation): NonNullable<NiscApp['reactions']> => [
  { table: 'questions', op: 'insert', run: () => moderation.judgeQuestions() },
  {
    table: 'deck',
    run: (_event, tools) => {
      for (const shell of server().shells?.list() ?? []) tools.deliver(shell.principal, 'deck-moved');
    },
  },
  // A reaction hears that the rows changed, not whose, so every member's roles
  // are read again; their shells take in what changed in place, keeping what
  // people were in the middle of.
  {
    table: 'grants',
    run: (event) => {
      if (GRANT_CHANGES.includes(event.fingerprint ?? '')) server().invalidateTag(MEMBERS);
    },
  },
];
