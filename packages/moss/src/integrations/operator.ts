import { Hono } from 'hono';
import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { Upgrader } from '@niscorp/strata';
import type { FeatureEnv, Replay } from '../feature';
import { INTEGRATION_ID, INTEGRATION_ID_RULE } from './bundle';
import type { Bundle } from './bundle';
import { hashIntegrationKey, mintIntegrationKey } from './credentials';
import { extensionContextOf, runIntake } from './intake';
import type { ExtensionConfig, IntakeContext } from './intake';
import { reachDeclares } from './reach';
import { approveIntegration, findIntegration, writeBundle, listIntegrations, recordFailedImport, removeIntegration, setBackToPending, registrationOf, storedActionsOf } from './registry';

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

export type OperatorDeps<Extension = undefined> = {
  // What the registry's entries are replayed by (./registry.ts).
  replay: Replay;
  // The host app's own vocabulary (./intake.ts). Absent: a bundle that carries
  // an `extension` is refused.
  extension: ExtensionConfig<Extension> | undefined;
  // The host's grammars: a bundle's actions are brought to them before they
  // are read, and stored stamped with them.
  grammars: Upgrader;
  // Every fingerprint the app serves: what an endpoint may name.
  fingerprints: () => Promise<readonly string[]>;
  // The host's two answers about what a bundle ships: whether a layout fits
  // the kit, and which chains of steps never end (./intake.ts).
  layoutMisfits: IntakeContext['layoutMisfits'];
  endlessChains: IntakeContext['endlessChains'];
  // The actions in force, and whether the app could be served with a given set.
  actions: () => Actions;
  refusalOf: (actions: Actions) => string | undefined;
  // Read the approved integrations' actions again and hand them to the running
  // manifest. Throws when the app could not be served with them.
  reload: () => Promise<void>;
  // How long a call out may take, in ms: the bundle fetched at registration,
  // and the probe.
  timeoutMs: number;
};

// A bundle that may land, or why it may not: what to keep on the row, and
// what to answer.
type Taken =
  | { ok: true; bundle: Bundle; extension: unknown }
  | { ok: false; error: string; status: 422 | 502; answer: { message: string; reasons?: string[] } };

const refused = (reasons: string[]): Taken => ({ ok: false, error: reasons.join('; '), status: 422, answer: { message: 'Refused.', reasons } });

// FETCH, THEN THE GATE, THEN THE APP'S `prepare`. Nothing is written here: a
// bundle that is refused at any of the three leaves the last good import
// serving.
const takeIn = async <Extension>(deps: OperatorDeps<Extension>, id: string, url: string): Promise<Taken> => {
  let payload: unknown;
  try {
    // Given up on when it has taken too long, the answer and its body
    // together: a service that never answers is one that did not answer.
    const response = await fetch(`${url.replace(/\/$/, '')}/bundle`, { signal: AbortSignal.timeout(deps.timeoutMs) });
    if (!response.ok) throw new Error(String(response.status));
    payload = await response.json();
  } catch {
    return { ok: false, error: 'the service did not answer with a bundle', status: 502, answer: { message: 'The integration did not answer with a bundle.' } };
  }

  const context = {
    integrationId: id,
    url,
    layoutMisfits: deps.layoutMisfits,
    endlessChains: deps.endlessChains,
    fingerprints: new Set(await deps.fingerprints()),
    upgrader: deps.grammars,
    hostActions: deps.actions(),
  };
  const result = runIntake(payload, { ...context, ...(deps.extension === undefined ? {} : { extension: deps.extension }) });
  if (!result.ok) return refused(result.reasons);

  // The app's own step, for an extension that is there: what it answers is
  // what the row keeps. One that throws refuses the bundle whole.
  const prepare = deps.extension?.prepare;
  if (prepare === undefined || result.extension === undefined) return { ok: true, bundle: result.bundle, extension: result.extension };
  try {
    return { ok: true, bundle: result.bundle, extension: await prepare(result.extension, extensionContextOf(result.bundle, context)) };
  } catch (error) {
    return refused([`extension: ${String(error)}`]);
  }
};

// Register / announce / re-import — one verb.
//
// THE ORDER HERE IS THE WHOLE SAFETY STORY. Intake validates the payload, the
// candidate action set is verified against the charter, and only then do rows
// land. A bundle that would make the manifest incoherent is refused with a
// sentence while the previous import keeps serving — because a bundle
// committed before that check would take the app down until somebody deleted
// rows by hand.
const register = <Extension>(deps: OperatorDeps<Extension>, routes: Hono<FeatureEnv>): void => {
  routes.post('/integrations', async (c) => {
    const sent: unknown = await c.req.json().catch(() => ({}));
    const { id, url } = RegisterBodySchema.parse(sent);
    if (id === '' || url === '') return c.json({ message: 'Give an id and a url.' }, 400);
    // Before anything is fetched or kept under it: the id becomes a segment of
    // a path and a part of an action's name (./bundle.ts).
    if (!INTEGRATION_ID.test(id)) return c.json({ message: INTEGRATION_ID_RULE }, 400);

    const taken = await takeIn(deps, id, url);
    if (!taken.ok) {
      await recordFailedImport(deps.replay, id, url, taken.error);
      return c.json(taken.answer, taken.status);
    }

    // The candidate manifest, verified BEFORE anything is written.
    const { approved: wasApproved, holdsKey } = await registrationOf(deps.replay, id);
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
    const { keptKey } = await writeBundle(deps.replay, {
      id,
      url,
      bundle: taken.bundle,
      extension: taken.extension,
      stamp: deps.grammars.stamp,
      ...(key === undefined ? {} : { keyHash: hashIntegrationKey(key) }),
    });

    await deps.reload();
    const status = wasApproved ? 'approved' : 'pending';
    // A KEY IS ANSWERED BY THE REGISTRATION WHOSE KEY THE ROW HOLDS, and by no
    // other. Two registrations of one new integration in the same moment both
    // mint one, since each was told the integration holds none; the row keeps
    // the first, and the other is answered as any import after the first is:
    // its bundle landed, and no key.
    return c.json({ id, status, actions: Object.keys(taken.bundle.actions).length, ...(key !== undefined && keptKey ? { key } : {}) });
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
// second place the candidate set is verified before anything is written.
//
// VERIFIED, THEN WRITTEN. The actions it shipped are read from its rows and
// laid over the actions in force, and the running manifest says whether the
// app could be served that way, without switching to it. Refused, nothing is
// written: the row is as it was. This used to write the approval, hand the
// actions over, and write the row back when that threw — and a process that
// died between the two writes left an approved row the next boot refused.
//
// AND TAKEN BACK WHEN THE APP DOES NOT TAKE IT ALL THE SAME. Asking first makes
// a refusal after the write rare; it does not make it impossible. Between the
// question and the hand-over something else can change what the app consists
// of (another approval, a set the app handed over), and the rows are read
// again for the hand-over. When that throws, the row already says approved:
// answered as a fault, it stayed approved, and every process that read the
// rows next was refused them, the next boot included. So the approval is set
// back to pending with why, what is served is read again from the rows as
// they are then, and the answer is the refusal it is.
const approve = (deps: Pick<OperatorDeps, 'replay' | 'grammars' | 'actions' | 'refusalOf' | 'reload'>, routes: Hono<FeatureEnv>): void => {
  routes.post('/integrations/:id/approve', async (c) => {
    const id = c.req.param('id');
    const refusal = deps.refusalOf({ ...deps.actions(), ...(await storedActionsOf(deps.replay, id, deps.grammars)) });
    if (refusal !== undefined) return c.json({ message: 'Refused — the app would not serve this.', reasons: [`Error: ${refusal}`] }, 422);
    const requested = await approveIntegration(deps.replay, id);
    if (requested === undefined) return c.json({ message: 'No such integration.' }, 404);
    try {
      await deps.reload();
    } catch (error) {
      const why = String(error);
      await setBackToPending(deps.replay, id, why);
      await deps.reload();
      return c.json({ message: 'Refused — the app would not serve this.', reasons: [why] }, 422);
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
const probe = (deps: Pick<OperatorDeps, 'replay' | 'timeoutMs'>, routes: Hono<FeatureEnv>): void => {
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
      // A probe of a service that never answers says so, in as long as any
      // call out may take.
      const response = await fetch(`${found.url.replace(/\/$/, '')}/${path}`, { signal: AbortSignal.timeout(deps.timeoutMs) });
      const text = await response.text();
      return c.json({ status: response.status, ms: Date.now() - started, body: text.slice(0, 2000) });
    } catch (err) {
      return c.json({ status: 0, ms: Date.now() - started, body: String(err) });
    }
  });
};

export const operatorRoutes = <Extension = undefined>(deps: OperatorDeps<Extension>): Hono<FeatureEnv> => {
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
