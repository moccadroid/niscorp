import { defineApp } from '@niscorp/moss';
import type { NiscApp, RunSink, ShellManifest } from '@niscorp/moss';
import { actions } from './action-catalog';
import { charter, WEARABLE } from './charter/charter';
import { shell } from './shell/shell';
import { BEHAVIORS, ENTRIES } from './vex';

export type AppSeams = {
  functions: NonNullable<NiscApp['functions']>;
  identity: NonNullable<NiscApp['identity']>;
  inputs: NonNullable<ShellManifest['inputs']>;
  runs: RunSink;
};

export const buildApp = (seams: AppSeams): NiscApp =>
  defineApp({
    charter,
    wearable: WEARABLE,
    actions,
    entries: ENTRIES,
    behaviors: BEHAVIORS,
    shell: { ...shell, inputs: seams.inputs },
    identity: seams.identity,
    functions: seams.functions,
    runs: seams.runs,
  });
