import type { Data } from '../data';
import { createRunningManifest } from '../manifest';
import type { NiscApp, RunningManifest } from '../manifest';
import type { NiscRuntime } from '../runtime';

// WHAT THE APP CONSISTS OF RIGHT NOW (../manifest): what it shipped, and the
// sets of actions that arrive while it runs — an app's own, through
// `replaceActions`; a feature's, through the seams. Every surface asks it
// which actions are in force and what a set of roles holds of them, and it is
// the one place either changes.
//
// Creating it IS the boot check: an incoherent manifest refuses here, before
// anything else stands (the charter with each role's closure audited, every
// entry's reach, the layout variants).
export const standManifest = (app: NiscApp, runtime: Pick<NiscRuntime, 'pool' | 'sessionRevalidateMs'>, data: Pick<Data, 'grants' | 'dropOnChange'>): RunningManifest => {
  const running = createRunningManifest({
    shipped: app,
    grants: data.grants,
    // Polled on the clock a socket's credential is re-verified on. (The
    // pointer's table is part of MOSS_SEQUENCE, applied with the rest by the
    // data module.)
    pointer: { pool: runtime.pool, ...(runtime.sessionRevalidateMs !== undefined ? { everyMs: runtime.sessionRevalidateMs } : {}) },
  });
  // The policies were compiled from the manifest: they go when it changes.
  // Handed over here, because the manifest could not be built before the
  // grantable set was known.
  data.dropOnChange(running.onChange);
  return running;
};
