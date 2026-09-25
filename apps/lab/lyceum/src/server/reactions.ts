import { z } from 'zod';
import type { MossServer, NiscApp } from '@niscorp/moss';
import { roomWatchers } from '@lyceum/app/vex/member.entries';

// WRITERS ANNOUNCE, VIEWERS REACT — across principals. A change to the room's
// members (somebody stepped in, somebody was sorted) is announced to the
// principals that watch the room: the speaker's controller and the stage. The
// announcement carries no rows; each of them re-reads under its own policy.
//
// Who watches is itself a row (`grants`), read as the `identity` role.

const WatchersSchema = z.array(z.object({ principal: z.string() }));

export const lyceumReactions = (server: () => MossServer): NonNullable<NiscApp['reactions']> => [
  {
    table: 'members',
    run: (_event, tools) => {
      void (async () => {
        const watchers = WatchersSchema.parse((await server().executeAs('identity', roomWatchers.fingerprint, {})) ?? []);
        for (const { principal } of watchers) tools.deliver(principal, 'members-changed');
      })().catch((error: unknown) => console.error('[lyceum] announcing a members change failed', error));
    },
  },
];
