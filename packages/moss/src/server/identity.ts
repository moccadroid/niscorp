import type { Data } from '../data';
import { createIdentity } from '../identity';
import type { Identity } from '../identity';
import type { NiscApp } from '../manifest';
import type { NiscRuntime } from '../runtime';
import { DEFAULT_REVALIDATE_MS } from '../socket';

// WHO A PRINCIPAL IS, for every surface (../identity). It is handed the app's
// three seams and the limits, and reaches rows only through `executeAs`: an
// identity entry is a seeded entry like any other.
export const standIdentity = (
  app: Pick<NiscApp, 'identity' | 'assignments' | 'scope'>,
  runtime: Pick<NiscRuntime, 'identityMax' | 'identityIdleMs' | 'sessionRevalidateMs'>,
  data: Pick<Data, 'executeAs'>,
): Identity =>
  createIdentity({
    seam: app.identity,
    assignments: app.assignments,
    scope: app.scope,
    readAs: (role, fingerprint, scope) => data.executeAs(role, fingerprint, {}, scope),
    max: runtime.identityMax,
    idleMs: runtime.identityIdleMs,
    // A record goes stale on the clock a live socket's credential does.
    revalidateMs: runtime.sessionRevalidateMs ?? DEFAULT_REVALIDATE_MS,
  });
