import { createTide } from '@niscorp/tide';
import type { Tide } from '@niscorp/tide';
import { evaluate } from '@niscorp/prism';
import { createTideStore } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { mutationEffect } from '@niscorp/vex';
import type { PgPool } from '@niscorp/vex';
import { MUTATION_ENTRIES } from '@lyra/app/vex';
import { reflexesFor } from '@lyra/app/reflexes/compose';
import type { AutomationRow } from '@lyra/app/reflexes/compose';
import { everyone } from './users';
import { mintDevToken } from '@niscorp/moss';

type Deps = { server: () => MossServer; now: () => number; pool: PgPool };

const tokenFor = (studioId: string): string => {
  const robot = everyone().find((p) => p.audience === 'automation' && p.studioId === studioId);
  if (robot === undefined) throw new Error(`tide: ${studioId} has no automation principal`);
  return mintDevToken(robot.id);
};

// One POST to the app's own surface. `as` carries the studio, so the identity
// travels with the work rather than being ambient. `chain` carries the run's
// position when an EFFECT is the caller — the bridge stamps it onto the facts
// it mints from this write, so the depth ceiling survives the trip through
// the database. Moss trusts the headers only because `facts.chain` (app.ts)
// vouches for the automation principal this token names.
const callVex = async (deps: Deps, as: string, fingerprint: string, context: Record<string, unknown>, chain?: { cause: string; depth: number }): Promise<unknown> => {
  const studioId = as.slice(as.indexOf('@') + 1);
  const response = await deps.server().fetch(
    new Request('http://lyra/api/automation/vex', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokenFor(studioId)}`,
        ...(chain !== undefined ? { 'x-tide-cause': chain.cause, 'x-tide-depth': String(chain.depth) } : {}),
      },
      body: JSON.stringify({ fingerprint, context }),
    }),
  );
  if (!response.ok) {
    const detail: unknown = await response.json().catch(() => null);
    const message = detail !== null && typeof detail === 'object' && 'message' in detail ? String((detail as { message: unknown }).message) : `refused (${response.status})`;
    throw new Error(`${fingerprint}: ${message}`);
  }
  return response.json();
};

// ASK THE SAME QUESTION THE AUTOMATION WOULD, AS THE AUTOMATION.
//
// Exported so the builder's rehearsal runs down the identical path a reflex
// does — same fingerprint, same principal, same compiled scope policy. That
// is the whole value of it: three of the moments this app used to ship named
// tables the automation rung cannot read, so they were REFUSED on every run,
// and the screen offering them had no way to know. Asking as somebody else —
// the operator, say — would have answered happily and proved nothing.
export const askAsAutomation = async (
  server: MossServer,
  studioId: string,
  fingerprint: string,
  context: Record<string, unknown>,
): Promise<unknown> => callVex({ server: () => server, now: () => Date.now(), pool: undefined as never }, `automation@${studioId}`, fingerprint, context);

export const wireTide = (deps: Deps): Tide => {
  const effects = (as: string | undefined) =>
    Object.fromEntries(
      MUTATION_ENTRIES.map((entry) => [
        entry.fingerprint,
        {
          // DERIVED, never declared: the tables this effect writes fall out
          // of its own mutation definition, so the flow graph's cycle
          // refusal sees the truth. A blind edge in the load report now
          // genuinely means "something bypassed vex".
          writes: [...new Set(mutationEffect(entry.mutation).map((effect) => effect.table))],
          run: async (input: unknown, ctx: import('@niscorp/tide').TideCtx) => {
            if (as === undefined) throw new Error('tide: an effect ran with no identity');
            // The write this performs comes back as facts (the vex bridge);
            // forwarding the task and depth is what keeps that re-entry ON
            // the chain instead of starting a fresh one.
            return callVex(deps, as, entry.fingerprint, (input ?? {}) as Record<string, unknown>, { cause: `task:${ctx.taskId}`, depth: ctx.depth });
          },
        },
      ]),
    );

  return createTide({
    store: createTideStore(deps.pool),

    transform: (config, source) => evaluate(config, source as never),

    select: async (query, ctx) => {
      const spec = query as { fingerprint: string; context?: Record<string, unknown> };
      const as = typeof ctx.actor === 'string' ? ctx.actor : '';
      if (as === '') throw new Error('tide: a selection ran with no identity');

      const body = await callVex(deps, as, spec.fingerprint, spec.context ?? {});
      // The vex surface answers `{ result, meta }`, not a bare array — reading
      // the envelope as the rows yields ZERO rows rather than an error, which is
      // a reflex that silently never fires.
      const rows = body !== null && typeof body === 'object' && 'result' in body ? (body as { result: unknown }).result : body;
      if (!Array.isArray(rows)) throw new Error(`tide: ${spec.fingerprint} did not answer with rows`);
      return rows as Record<string, unknown>[];
    },

    effects,

    actor: (as) => as,
  });
};

export const reflexesForEveryStudio = (studios: { id: string; timezone: string }[], rows: readonly (AutomationRow & { studio_id: string })[]) =>
  studios.flatMap((studio) =>
    reflexesFor(
      studio.id,
      studio.timezone,
      rows.filter((row) => row.studio_id === studio.id),
    ),
  );
