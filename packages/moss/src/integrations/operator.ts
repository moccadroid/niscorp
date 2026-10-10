import { Hono } from 'hono';
import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { Upgrader } from '@niscorp/strata';
import type { FeatureEnv, Replay } from '../feature';
import type { Bundle } from './bundle';
import { hashIntegrationKey, mintIntegrationKey } from './credentials';
import { intakeContextOf, runIntake } from './intake';
import type { HostVocabulary } from './intake';
import { describePlacements } from './placements';
import { copyPress } from './press';
import type { StorePress } from './press';
import { reachDeclares } from './reach';
import { approveIntegration, findIntegration, landBundle, listIntegrations, recordFailedImport, removeIntegration, setBackToPending, standingOf } from './registry';

// ═══════════════════════════════════════════════════════════════
// THE OPERATOR SEAM — everything that decides WHICH integrations this
// deployment trusts. Keyed, principal-less, and 404 without — a stranger who
// finds the path gets the same answer as a stranger with a wrong key, which is
// nothing. (The key and the app's own gate are the server's; these routes are
// mounted behind them.)
//
// What is deliberately NOT here: installing one for a studio. That is a
// tenant decision made by somebody signed in, so it lives on the app's own
// surfaces under the charter, where it can be audited against a person.
//
// An integration announces; we fetch. There is no poll and no boot sweep:
// `POST /operator/integrations` IS the announcement, it is idempotent, and
// re-importing after a deploy is the same call with the same body.
// ═══════════════════════════════════════════════════════════════

// ── what a route is sent ─────────────────────────────────────
//
// A body is whatever the caller wrote. Each route reads the fields it has a
// use for; a body that is not an object, or a field that is not text, reads as
// that field left out.
const RegisterBodySchema = z.looseObject({ id: z.string().catch(''), url: z.string().catch('') }).catch({ id: '', url: '' });
const ProbeBodySchema = z.looseObject({ path: z.string().optional().catch(undefined) }).catch({});

type Actions = Readonly<Record<string, ActionDefinition>>;

export type OperatorDeps = {
  // What the registry's entries are replayed by (./registry.ts).
  replay: Replay;
  // The host's grammars: a bundle's actions are brought to them before they
  // are read, and stored stamped with them.
  grammars: Upgrader;
  // Every fingerprint the app serves: what an endpoint may name.
  fingerprints: () => Promise<readonly string[]>;
  // What the host offers a bundle to name (./intake.ts).
  vocabulary: HostVocabulary;
  // The actions in force, and whether the app could be served with a given set.
  actions: () => Actions;
  refusalOf: (actions: Actions) => string | undefined;
  // Read the approved integrations' actions again and hand them to the running
  // manifest. Throws when the app could not be served with them.
  reload: () => Promise<void>;
  // The host's words for its own hubs and screens, for the placement sentence.
  placementNames: Readonly<Record<string, string>>;
  // Where a press image lands. Absent: a bundle that declares press is refused.
  storePress: StorePress | undefined;
};

// A bundle that may land, or why it may not: what to keep on the row, and
// what to answer.
type Taken =
  | { ok: true; bundle: Bundle; press: readonly string[] }
  | { ok: false; error: string; status: 422 | 502; answer: { message: string; reasons?: string[] } };

// FETCH, THEN THE GATE, THEN THE PRESS. Nothing is written here: a bundle that
// is refused at any of the three leaves the last good import serving.
const takeIn = async (deps: OperatorDeps, id: string, url: string): Promise<Taken> => {
  let payload: unknown;
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/bundle`);
    if (!response.ok) throw new Error(String(response.status));
    payload = await response.json();
  } catch {
    return { ok: false, error: 'the service did not answer with a bundle', status: 502, answer: { message: 'The integration did not answer with a bundle.' } };
  }

  const fingerprints = new Set(await deps.fingerprints());
  const result = runIntake(payload, { ...intakeContextOf(deps.vocabulary, id, fingerprints, deps.grammars), hostActions: deps.actions() });
  if (!result.ok) return { ok: false, error: result.reasons.join('; '), status: 422, answer: { message: 'Refused.', reasons: result.reasons } };

  // Press crosses HERE — after the gate, before the candidate is
  // verified — so a press refusal leaves the app exactly as it
  // found it. Blobs written before a later refusal are orphans in the
  // host's store, which is cheaper than any coherence they could buy.
  const press = await copyPress(result.bundle, id, url, deps.storePress);
  if (!press.ok) return { ok: false, error: press.reasons.join('; '), status: 422, answer: { message: 'Refused.', reasons: press.reasons } };
  return { ok: true, bundle: result.bundle, press: press.urls };
};

// Register / announce / re-import — one verb.
//
// THE ORDER HERE IS THE WHOLE SAFETY STORY. Intake validates the payload, the
// candidate action set is verified against the charter, and only then do rows
// land. A bundle that would make the manifest incoherent is refused with a
// sentence while the previous import keeps serving — because a bundle
// committed before that check would take the app down until somebody deleted
// rows by hand.
const register = (deps: OperatorDeps, routes: Hono<FeatureEnv>): void => {
  routes.post('/integrations', async (c) => {
    const sent: unknown = await c.req.json().catch(() => ({}));
    const { id, url } = RegisterBodySchema.parse(sent);
    if (id === '' || url === '') return c.json({ message: 'Give an id and a url.' }, 400);

    const taken = await takeIn(deps, id, url);
    if (!taken.ok) {
      await recordFailedImport(deps.replay, id, url, taken.error);
      return c.json(taken.answer, taken.status);
    }

    // The candidate manifest, verified BEFORE anything is written.
    const { approved: wasApproved, holdsKey } = await standingOf(deps.replay, id);
    if (wasApproved) {
      // TRIED, NOT PUT IN. The bundle's actions over the actions in force are
      // a candidate the running manifest verifies without switching to it, so
      // a bundle that is refused never touched what is serving. The reason
      // reads as the thrown error did.
      const refusal = deps.refusalOf({ ...deps.actions(), ...taken.bundle.actions });
      if (refusal !== undefined) return c.json({ message: 'Refused — the app would not serve this.', reasons: [`Error: ${refusal}`] }, 422);
    }

    // MINTED ONCE, SHOWN ONCE. Registration is a GRANTING ceremony — the
    // deployment issues the integration its identity, never the other way
    // around — so the first registration answers with the key and the row
    // keeps only the hash. A re-import repeats neither: the key is not stored,
    // so there is nothing to repeat. Losing it is not recovery, it is removal
    // and re-registration, which also re-fences everything the old key held.
    const key = holdsKey ? undefined : mintIntegrationKey();

    // The row, the actions and the hash of the key land together or not at all.
    await landBundle(deps.replay, {
      id,
      url,
      bundle: taken.bundle,
      adds: describePlacements(taken.bundle, deps.placementNames),
      press: taken.press,
      stamp: deps.grammars.stamp,
      ...(key === undefined ? {} : { keyHash: hashIntegrationKey(key) }),
    });

    await deps.reload();
    const status = wasApproved ? 'approved' : 'pending';
    return c.json({ id, status, actions: Object.keys(taken.bundle.actions).length, ...(key === undefined ? {} : { key }) });
  });
};

// APPROVAL IS WHERE THE GRANTS BECOME REAL.
//
// Registration only records what an integration ASKED for. Nothing it ships
// is served until somebody looks at the two lists side by side and says yes —
// which is what keeps "the charter denies what it does not know" true while
// still letting an integration name what it needs.
//
// Approving is also the moment its actions join the manifest, so this is the
// second place the candidate set is verified before anything is served.
const approve = (deps: OperatorDeps, routes: Hono<FeatureEnv>): void => {
  routes.post('/integrations/:id/approve', async (c) => {
    const id = c.req.param('id');
    const requested = await approveIntegration(deps.replay, id);
    if (requested === undefined) return c.json({ message: 'No such integration.' }, 404);
    try {
      await deps.reload();
    } catch (err) {
      await setBackToPending(deps.replay, id, String(err));
      await deps.reload();
      return c.json({ message: 'Refused — the app would not serve this.', reasons: [String(err)] }, 422);
    }
    return c.json({ id, status: 'approved', granted: requested });
  });
};

// A LIVE CALL, because "the screen is empty" has three causes in three
// systems and an operator should not have to guess which. This says what the
// integration answered, right now, without a browser or a signed-in person.
//
// It probes what the integration DECLARED, plus `bundle` — which is the
// answer to "the screen is empty" most of the time and is open by design
// anyway. It used to take an operator-chosen arbitrary path, which made this
// a second door into the integration's service beside the proxy, and one that minted
// no assertion at all. An operator wanting a path the integration never declared is
// asking a question about somebody else's service, not about this one.
const probe = (deps: OperatorDeps, routes: Hono<FeatureEnv>): void => {
  routes.post('/integrations/:id/probe', async (c) => {
    const id = c.req.param('id');
    const found = await findIntegration(deps.replay, id);
    if (found === undefined) return c.json({ message: 'No such integration.' }, 404);
    const sent: unknown = await c.req.json().catch(() => ({}));
    const path = ProbeBodySchema.parse(sent).path ?? 'bundle';
    // The declaration holds host-side paths (`/integrations/<id>/roster`); a
    // probe names the integration-side tail (`roster`), the same tail the proxy
    // forwards. One spelling to compare, derived rather than stored twice.
    if (path !== 'bundle' && !reachDeclares(found.reach, `/integrations/${id}/${path}`)) {
      return c.json({ message: 'That path is not one this integration declared.' }, 404);
    }
    const started = Date.now();
    try {
      const response = await fetch(`${found.url.replace(/\/$/, '')}/${path}`);
      const text = await response.text();
      return c.json({ status: response.status, ms: Date.now() - started, body: text.slice(0, 2000) });
    } catch (err) {
      return c.json({ status: 0, ms: Date.now() - started, body: String(err) });
    }
  });
};

export const operatorRoutes = (deps: OperatorDeps): Hono<FeatureEnv> => {
  const routes = new Hono<FeatureEnv>();
  routes.get('/integrations', async (c) => c.json({ integrations: await listIntegrations(deps.replay) }));
  register(deps, routes);
  approve(deps, routes);

  // Uninstalling for good: the rows go, the actions leave the manifest, and a
  // living shell adopts. What the integration stored stays with the integration
  // — which is why reinstalling restores it.
  routes.delete('/integrations/:id', async (c) => {
    const id = c.req.param('id');
    await removeIntegration(deps.replay, id);
    await deps.reload();
    return c.json({ id, removed: true });
  });

  probe(deps, routes);
  return routes;
};
