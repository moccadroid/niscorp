import { Hono } from 'hono';
import { z } from 'zod';
import type { Charter } from '@niscorp/charter';
import { paletteEntryOf } from '@niscorp/nova';
import type { ActionDefinition, ComponentMeta, LayoutPaletteEntry } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
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
      // a bundle that is refused never touched what is serving.
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
// written: the row is as it was. Written first and taken back on a refusal, a
// process that died between the two writes would leave an approved row the
// next boot refuses.
//
// AND TAKEN BACK WHEN THE APP DOES NOT TAKE IT ALL THE SAME. Asking first makes
// a refusal after the write rare; it does not make it impossible. Between the
// question and the hand-over something else can change what the app consists
// of (another approval, a set the app handed over), and the rows are read
// again for the hand-over. When that throws, the row already says approved,
// and every process that reads the rows next would be refused them, the next
// boot included. So the approval is set back to pending with why, what is
// served is read again from the rows as they are then, and the answer is the
// refusal it is.
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
// anyway. A path of the operator's own choosing would make this a second door
// into the integration's service beside the proxy, and one that mints no
// assertion: an operator wanting a path the integration never declared is
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

// ── the contract an integration is built against ─────────────
//
// With no shared code, an author cannot import a fingerprint constant or a
// component name. This is what replaces those imports: the same information,
// over the wire, in the two formats somebody might want it in.
export type Contract = {
  // Each component the author may compose, with its description and — where the
  // app carried one — its props as a draft-7 JSON Schema derived from the same
  // Zod schema the renderer validates against. A component the app registered
  // with no meta appears as its name alone.
  components: readonly LayoutPaletteEntry[];
  audiences: readonly string[];
  namespace: string;
  actionSchema: string;
  // What the host app tells vendors about its own vocabulary: what a bundle
  // may say under `extension`. As the app handed it over; absent when it
  // handed none.
  extension?: unknown;
};

// A props schema the contract can show: it converts itself to JSON Schema
// (Standard JSON Schema), whichever copy of zod the kit built it with. That is
// all nova's palette asks of it, so it is all that is asked here.
const convertsItself = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const standard: unknown = Reflect.get(value, '~standard');
  const converter: unknown = isRecord(standard) ? standard['jsonSchema'] : undefined;
  return isRecord(converter) && typeof converter['output'] === 'function';
};

// What a kit said of one component, as nova's palette reads it. A props schema
// that cannot be shown is left out, and the component is listed without it.
const ComponentMetaSchema = z.object({
  description: z.string().optional().catch(undefined),
  propsSchema: z.custom<z.ZodType>(convertsItself).optional().catch(undefined),
});

const componentMetaOf = (meta: unknown): ComponentMeta => {
  const read = ComponentMetaSchema.safeParse(meta ?? {});
  return read.success ? read.data : {};
};

// What the contract is made of: the kit's components and the charter, which
// the server knows, and what the app tells vendors of its own vocabulary.
export type ContractHost = {
  components: Readonly<Record<string, { meta?: unknown }>>;
  charter: Charter;
  // `extension.contract` of `createIntegrations` (./intake.ts).
  extension?: unknown;
};

export const buildContract = (host: ContractHost, integrationId: string): Contract => {
  // Name + description + props schema per component, from the same converter the
  // layout agent's palette uses — the contract is that palette asked for a
  // person instead of an agent. Unfiltered on purpose: what intake will enforce
  // (the sibling props check) is the whole schema, so the docs must show the
  // whole schema, or an author reads one contract and is judged against another.
  const registered = host.components;
  const components = Object.keys(registered)
    .sort()
    .map((name) => paletteEntryOf(name, componentMetaOf(registered[name]?.meta)));
  // Every audience the charter has drawn an `ext.` fence for. An integration
  // may claim a namespace under these and nowhere else.
  const audiences = new Set<string>();
  for (const def of Object.values(host.charter)) {
    if (def === undefined || Array.isArray(def)) continue;
    const selection = def.actions;
    const list = Array.isArray(selection) ? selection : (selection?.allow ?? []);
    for (const entry of list) {
      const parts = entry.split('.');
      if (parts[0] === 'ext' && parts[1] !== undefined && parts[1] !== '*') audiences.add(parts[1]);
    }
  }
  return {
    components,
    audiences: [...audiences].sort(),
    namespace: `ext.<audience>.${integrationId}.<name>`,
    actionSchema: 'nova ActionDefinition',
    ...(host.extension === undefined ? {} : { extension: host.extension }),
  };
};

// One prop's TYPE column, from its JSON Schema node. The closed sets are the
// point — an enum (`emphasis` is one of four) and a union of literals surface as
// `enum` / `anyOf` of consts, neither of which is a bare `type`, so an author
// told only "string" learns nothing about which strings. A numeric range (a kit
// whose gaps are steps 0–6) rides along.
const describeProp = (schema: Record<string, unknown>): string => {
  const enumValues = schema['enum'];
  if (Array.isArray(enumValues)) return `one of: ${enumValues.map((v) => String(v)).join(', ')}`;
  const anyOf = schema['anyOf'];
  if (Array.isArray(anyOf)) {
    const consts = anyOf.map((option: unknown) => (isRecord(option) ? option['const'] : undefined)).filter((v) => v !== undefined);
    if (consts.length === anyOf.length && consts.length > 0) return `one of: ${consts.map((v) => String(v)).join(', ')}`;
  }
  const type = schema['type'];
  const base = typeof type === 'string' ? type : Array.isArray(type) ? type.map((t) => String(t)).join(' | ') : 'value';
  const min = schema['minimum'];
  const max = schema['maximum'];
  if (typeof min === 'number' || typeof max === 'number') return `${base} (${typeof min === 'number' ? min : '…'}–${typeof max === 'number' ? max : '…'})`;
  return base;
};

// One component: its name, its description, and — where it carried a schema — a
// small table of props (name · type · required · meaning). A component with no
// props renders as its name alone.
//
// The two parts of a component's JSON Schema the table is made of.
const PropsTableSchema = z.looseObject({
  properties: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  required: z.array(z.string()).optional(),
});

const componentAsMarkdown = (component: LayoutPaletteEntry): string => {
  const head = component.description !== '' ? `**${component.name}** — ${component.description}` : `**${component.name}**`;
  const table = PropsTableSchema.safeParse(component.propsSchema);
  const properties = table.success ? table.data.properties : undefined;
  if (properties === undefined || Object.keys(properties).length === 0) return head;
  const required = new Set(table.success ? (table.data.required ?? []) : []);
  const rows = Object.entries(properties).map(
    ([prop, spec]) => `| ${prop} | ${describeProp(spec)} | ${required.has(prop) ? 'yes' : 'no'} | ${String(spec['description'] ?? '')} |`,
  );
  return [head, ``, `| prop | type | required | meaning |`, `| --- | --- | --- | --- |`, ...rows].join('\n');
};

export const contractAsMarkdown = (contract: Contract, fingerprints: readonly string[]): string =>
  [
    `# What you can build against`,
    ``,
    `## Your namespace`,
    ``,
    `    ${contract.namespace}`,
    ``,
    `Every action you ship must be named this way. Audiences available: ${contract.audiences.join(', ') || '(none)'}.`,
    ``,
    `## Components your layouts may use`,
    ``,
    contract.components.map(componentAsMarkdown).join('\n\n') || '(none)',
    ``,
    `## Fingerprints you may call`,
    ``,
    `Endpoints may target \`/api/<resource>/vex\` with one of these, or any URL under`,
    `\`/integrations/<your id>/\`. Nothing else.`,
    ``,
    fingerprints.map((f) => `- ${f}`).join('\n') || '(none — your grants reach nothing yet)',
    ``,
    ...(contract.extension === undefined
      ? []
      : [
          `## What this app adds: \`extension\``,
          ``,
          `A bundle says what belongs to this app's own vocabulary under \`extension\`. What the app tells you of it:`,
          ``,
          '```json',
          JSON.stringify(contract.extension, null, 2),
          '```',
          ``,
        ]),
    `## What you cannot ship`,
    ``,
    `- vex entries or mutations. Call what is listed above; if you need a read that`,
    `  does not exist, it is a change to the app.`,
    `- \`fn:\` endpoints. Those run in the app's process.`,
    `- components. Layouts compose what is listed above.`,
    `- tables. Bring your own storage; we hand you identifiers.`,
    ``,
  ].join('\n');

// ── where the contract is served ─────────────────────────────

export type ContractDeps = {
  host: ContractHost;
  // The fingerprints whoever asks may replay: what the contract lists is the
  // caller's own, so an integration asking with its key reads what its actor's
  // rung reaches, and somebody granted nothing reads none.
  fingerprintsFor: (principal: string | null) => Promise<readonly string[]>;
  // The public half of the deployment's signing key (./credentials.ts).
  verifyKey: string;
};

export const contractRoutes = (deps: ContractDeps): Hono<FeatureEnv> => {
  const routes = new Hono<FeatureEnv>();

  // Everything an integration is built against, in the two formats somebody
  // might want. With no shared code an author cannot import a component name or
  // a fingerprint constant — this is what replaces those imports.
  routes.get('/api/integrations/contract', async (c) => {
    const id = c.req.query('id') ?? '<your id>';
    const contract = buildContract(deps.host, id);
    const fingerprints = await deps.fingerprintsFor(c.get('principal'));
    if (c.req.query('format') === 'md') {
      return new Response(contractAsMarkdown(contract, fingerprints), {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    }
    return c.json({ ...contract, fingerprints, verifyKey: deps.verifyKey });
  });

  // The public half of the deployment's signing key — OPEN, because holding it
  // only verifies. An integration reads it once (an env var an operator sets,
  // or a fetch it caches) and every identity claim it will ever trust is
  // checked against it. One key serves every integration; there is no
  // per-integration outbound credential to store, paste, or rotate.
  routes.get('/api/integrations/verify-key', (c) => c.json({ alg: 'ed25519', key: deps.verifyKey }));

  return routes;
};
