import type { FunctionHandler } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import type { QueryRequest } from '@niscorp/vex';
import { getVexRuntime, CURRENT_USER_ID, CURRENT_DATE } from '@relay/vex/runtime';
import { executeMutation } from '@relay/vex/mutations';
import type { MutationDefinition } from '@relay/vex/mutations';
import { scopePolicy } from '@relay/vex/scope';

// The query reader — the ONLY data code an action reaches. An endpoint names a
// `fn` whose id is a key in a screen's data prism (the `.prism.ts` seam): run
// that prism over the full action data (+ the current user as `$.userId`) → a
// Vex request; execute it (cache:'use' hits the seeded entry); hand the result
// back for Nova to write at the endpoint's target. ALL shaping — the request on
// the way in, the rows on the way out (the entry's Prism mapping, in Vex) — is
// declarative. The two casts are the Prism/Vex boundary; there are none elsewhere.
const query =
  (prism: unknown): FunctionHandler =>
  async (data) => {
    const request = evaluate(prism, { ...data, userId: CURRENT_USER_ID, today: CURRENT_DATE }) as QueryRequest;
    const rt = await getVexRuntime();
    const res = await rt.engine.execute(request, { cache: 'use' });
    return res.result;
  };

// Build the shell's `functions` map — one reader per fn id across the screens'
// merged seams.
export const queries = (prisms: Record<string, unknown>): Record<string, FunctionHandler> =>
  Object.fromEntries(Object.entries(prisms).map(([id, prism]) => [id, query(prism)]));

// The write counterpart of `query`, same two-part seam: an `input` prism maps
// the action's data (its own shape) → the mutation's DB-column `$context` — just
// as a read prism maps action data → request context. The `def` (in /api)
// declares the write structure with `{ $context }`/`{ $scope }` refs and never
// sees the action's namespace; the signed-in user is the server-injected
// `$scope.userId`. Returns the affected row(s). Direct, gated writes — engine in
// vex/mutations.
const mutation =
  (input: unknown, def: MutationDefinition): FunctionHandler =>
  async (data) => {
    const rt = await getVexRuntime();
    const schema = rt.engine.getSchema();
    if (schema === undefined) throw new Error('Vex schema not introspected.');
    const context = evaluate(input, { ...data, userId: CURRENT_USER_ID }) as Record<string, unknown>;
    const rows = await executeMutation(rt.db, def, {
      context,
      scope: { userId: CURRENT_USER_ID },
      policy: scopePolicy,
      schema,
    });
    // A single statement (every create/update endpoint) returns its one affected
    // row, so the action can open/refresh it via `$.<target>.id`. A transactional
    // batch returns the array.
    return rows.length === 1 ? rows[0] : rows;
  };

// Build the write half of `functions` — pair each mutation's input prism (the
// screen's seam) with its def (in /api) by `fn` id, one handler each.
export const mutations = (inputs: Record<string, unknown>, defs: Record<string, MutationDefinition>): Record<string, FunctionHandler> =>
  Object.fromEntries(Object.entries(defs).map(([id, def]) => [id, mutation(inputs[id], def)]));
