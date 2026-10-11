import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { NiscApp } from './app';

// THE ENTRIES AN APP SERVES: the reads and writes it shipped, in the order it
// wrote them. Pure, and the one place that says what they are.
//
// Two ask it. The running manifest (./running.ts) holds what it answers for as
// long as a server runs, and everything that seeds, verifies or looks up an
// entry is handed it from there. The step that migrates before a server
// starts (../data, migrate.ts) has no running manifest to ask, and asks here.
export const entriesOf = (app: Pick<NiscApp, 'entries'>): readonly (SeedEntry | SeedMutation)[] => app.entries ?? [];
