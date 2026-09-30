import type { MossServer, NiscApp } from '@niscorp/moss';

// THE DECK MOVED — a signal, not data. A slide is an action, and putting a new
// one on the stage's canvas is a navigation no data update can make, so the
// stage has to be told. Told as a channel with no rows: every living shell
// hears `deck-moved`, and only the stage's deck listens; it re-reads the row
// under its own policy and mounts that slide. (Reads that only DISPLAY the deck
// — the controller's "slide 3 / 6" — are reactive and need none of this.)
export const lyceumReactions = (server: () => MossServer): NonNullable<NiscApp['reactions']> => [
  {
    table: 'deck',
    run: (_event, tools) => {
      for (const shell of server().shells?.list() ?? []) tools.deliver(shell.principal, 'deck-moved');
    },
  },
];
