import type { Sequence } from '@niscorp/strata';

// A migration once run is never edited: a database that ran it refuses to boot. Change a table by appending one.
export const APP_SEQUENCE: Sequence = { id: 'mira.app', migrations: [] };
