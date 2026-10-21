import { defineApp } from '@niscorp/moss';
import type { NiscApp, RunSink } from '@niscorp/moss';
import { actions } from './action-catalog';
import { assignments } from './charter/assignments';
import { charter } from './charter/charter';
import { shell } from './shell/shell';
import { ENTRIES } from './vex';

// What answers a message, and where its model runs go, run on the server (src/server/compose, src/server/runs), handed in by the boot.
export const buildApp = (functions: NonNullable<NiscApp['functions']>, runs: RunSink): NiscApp => defineApp({ charter, assignments, actions, entries: ENTRIES, shell, functions, runs });
