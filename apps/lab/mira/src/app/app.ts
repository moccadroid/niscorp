import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { actions } from './action-catalog';
import { assignments } from './charter/assignments';
import { charter } from './charter/charter';
import { shell } from './shell/shell';
import { ENTRIES } from './vex';

// The functions are the one seam: what answers a message runs on the server (src/server/compose), handed in by the boot.
export const buildApp = (functions: NonNullable<NiscApp['functions']>): NiscApp => defineApp({ charter, assignments, actions, entries: ENTRIES, shell, functions });
