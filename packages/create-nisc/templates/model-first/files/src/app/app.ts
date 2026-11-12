import { defineApp } from '@niscorp/moss';
import type { NiscApp, RunSink, ShellManifest } from '@niscorp/moss';
import { actions } from './action-catalog';
import { assignments } from './charter/assignments';
import { charter } from './charter/charter';
import { shell } from './shell/shell';
import { ENTRIES } from './vex';

export type AppSeams = { functions: NonNullable<NiscApp['functions']>; runs: RunSink; seeds?: ShellManifest['seeds'] };

export const buildApp = (seams: AppSeams): NiscApp =>
  defineApp({ charter, assignments, actions, entries: ENTRIES, shell: { ...shell, ...(seams.seeds === undefined ? {} : { seeds: seams.seeds }) }, functions: seams.functions, runs: seams.runs });
