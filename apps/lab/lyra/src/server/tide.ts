import { createMemoryStore, createTide } from '@niscorp/tide';
import type { Tide } from '@niscorp/tide';
import { evaluate } from '@niscorp/prism';
import type { MossServer } from '@niscorp/moss';
import { MUTATION_ENTRIES } from '@lyra/app/vex';
import { reflexesFor } from '@lyra/app/reflexes/compose';
import type { AutomationRow } from '@lyra/app/reflexes/compose';
import { everyone } from './users';
import { mintDevToken } from '@niscorp/moss';

// TIDE, WIRED WITH APP-LEVEL SEAMS.
//
// Tide imports no host: storage, selection, transformation, effects and
// identity are all seams. Under moss those get filled with vex, prism, cortex
// and an `ActorContext` moss owns — none of which exists yet. This file fills
// them from inside Lyra instead, which is what a lab app is for: the shapes
// that survive here are the ones worth promoting.
//
// THE DECISION THAT MATTERS is how `select` and `effects` reach the database:
// they do not. They POST to the server's OWN vex surface as the studio's
// automation principal, exactly as a browser does. That costs a round trip
// through the app's own HTTP handler and buys the entire security story:
//
//   • the automation's statements are authored entries, replay-only
//   • its scope policy is compiled from a charter rung, not chosen here
//   • `studio_id` is stamped by the engine on every write it makes
//   • a reflex with a bug cannot exceed its rung, and neither can one
//     somebody edits later
//
// A `select` that opened `runtime.pool` would have been three lines shorter and
// would have made THIS FILE the tenant boundary. That is the trade the whole
// design is arranged to avoid, so it is not a trade worth taking for three
// lines.

type Deps = { server: () => MossServer; now: () => number };

// The automation principal for a studio, as a bearer token on its own request.
//
// It is the same token mechanism a person's magic link produces, because it is
// the same directory entry: a staff row with role `automation`. Nothing about
// this path is special-cased, which is the property being tested.
const tokenFor = (studioId: string): string => {
  const robot = everyone().find((p) => p.audience === 'automation' && p.studioId === studioId);
  if (robot === undefined) throw new Error(`tide: ${studioId} has no automation principal`);
  return mintDevToken(robot.id);
};

// One POST to the app's own surface. `as` carries the studio, so the identity
// travels with the work rather than being ambient.
const callVex = async (deps: Deps, as: string, fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
  const studioId = as.slice(as.indexOf('@') + 1);
  const response = await deps.server().fetch(
    new Request('http://lyra/api/automation/vex', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(studioId)}` },
      body: JSON.stringify({ fingerprint, context }),
    }),
  );
  if (!response.ok) {
    const detail: unknown = await response.json().catch(() => null);
    const message = detail !== null && typeof detail === 'object' && 'message' in detail ? String((detail as { message: unknown }).message) : `refused (${response.status})`;
    // THROWN, not returned. Tide's calling convention is the retry
    // classification: a throw is transient and gets bounded backoff. A refusal
    // is not transient — but it is also not a domain outcome to record, it is a
    // bug in the reflex or the charter, and retrying it a bounded number of
    // times before parking it visibly is the right way for that to surface.
    throw new Error(`${fingerprint}: ${message}`);
  }
  return response.json();
};

export const wireTide = (deps: Deps): Tide => {
  // Every seeded MUTATION becomes an effect, under its own fingerprint.
  //
  // This is the shape tide's design describes for moss, done by hand: a reflex
  // names `automation/notify` and gets the authored statement, which means the
  // effects registry has nothing app-specific in it and cannot drift from what
  // the app can actually write. An effect that is not a seeded mutation would
  // have to be added deliberately, which is the point.
  const effects = (as: string | undefined) =>
    Object.fromEntries(
      MUTATION_ENTRIES.map((entry) => [
        entry.fingerprint,
        {
          run: async (input: unknown) => {
            if (as === undefined) throw new Error('tide: an effect ran with no identity');
            return callVex(deps, as, entry.fingerprint, (input ?? {}) as Record<string, unknown>);
          },
        },
      ]),
    );

  return createTide({
    store: createMemoryStore(),

    // Prism, the same evaluator the shell's transform socket gets. A reflex's
    // templates are therefore the same language a screen's prisms are, which is
    // why `$dateAdd` in a reflex needs no explanation.
    // The cast is at the seam, where the two libraries' idea of "a value" meet:
    // tide's `Row` is an open record, prism's `JsonValue` a closed union. Both
    // describe the same JSON, and neither imports the other — which is the
    // whole reason the seam exists.
    transform: (config, source) => evaluate(config, source as never),

    select: async (query, ctx) => {
      const spec = query as { fingerprint: string; context?: Record<string, unknown> };
      const as = typeof ctx.actor === 'string' ? ctx.actor : '';
      if (as === '') throw new Error('tide: a selection ran with no identity');

      // The vex surface answers `{ result, meta }`, not a bare array. Reading
      // the envelope as the rows yields ZERO rows rather than an error — a
      // reflex that silently never fires, which is the failure mode this whole
      // file is arranged to avoid. Unwrapped explicitly, and anything that is
      // not a list is a bug worth throwing on rather than treating as "none".
      const body = await callVex(deps, as, spec.fingerprint, spec.context ?? {});
      const rows = body !== null && typeof body === 'object' && 'result' in body ? (body as { result: unknown }).result : body;
      if (!Array.isArray(rows)) throw new Error(`tide: ${spec.fingerprint} did not answer with rows`);
      return rows as Record<string, unknown>[];
    },

    effects,

    // `as` is opaque to tide and meaningful here: it names the studio whose
    // automation principal the work runs as, and it is what `callVex` turns
    // into a token. Threaded through `select` and every `run` unchanged.
    actor: (as) => as,
  });
};

// The reflexes every studio gets. Derived from the directory rather than
// authored per tenant — the same pressure `assignments` is under, and the same
// answer: rows when the artifact layer lands, derivation until then.
export const reflexesForEveryStudio = (studios: { id: string; timezone: string }[], rows: readonly (AutomationRow & { studio_id: string })[]) =>
  studios.flatMap((studio) =>
    reflexesFor(
      studio.id,
      studio.timezone,
      rows.filter((row) => row.studio_id === studio.id),
    ),
  );
