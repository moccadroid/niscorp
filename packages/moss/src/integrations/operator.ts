import { Hono } from 'hono';
import { z } from 'zod';
import type { Charter } from '@niscorp/charter';
import { paletteEntryOf } from '@niscorp/nova';
import type { ActionDefinition, ComponentMeta, LayoutPaletteEntry } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import type { Upgrader } from '@niscorp/strata';
import type { FeatureEnv, Replay } from '../feature';
import { INTEGRATION_ID, INTEGRATION_ID_RULE, extensionContextOf, runIntake } from './intake';
import type { Bundle, ExtensionConfig, IntakeContext } from './intake';
import { hashIntegrationKey, mintIntegrationKey } from './credentials';
import { reachDeclares } from './reach';
import { approveIntegration, findIntegration, writeBundle, listIntegrations, recordFailedImport, removeIntegration, setBackToPending, registrationOf, storedActionsOf } from './registry';

const RegisterBodySchema = z.looseObject({ id: z.string().catch(''), url: z.string().catch('') }).catch({ id: '', url: '' });
const ProbeBodySchema = z.looseObject({ path: z.string().optional().catch(undefined) }).catch({});

type Actions = Readonly<Record<string, ActionDefinition>>;

export type OperatorDeps<Extension = undefined> = {
  replay: Replay;
  extension: ExtensionConfig<Extension> | undefined;
  grammars: Upgrader;
  fingerprints: () => Promise<readonly string[]>;
  layoutMisfits: IntakeContext['layoutMisfits'];
  endlessChains: IntakeContext['endlessChains'];
  actions: () => Actions;
  refusalOf: (actions: Actions) => string | undefined;
  reload: () => Promise<void>;
  timeoutMs: number;
};

type Taken =
  | { ok: true; bundle: Bundle; extension: unknown }
  | { ok: false; error: string; status: 422 | 502; answer: { message: string; reasons?: string[] } };

const refused = (reasons: string[]): Taken => ({ ok: false, error: reasons.join('; '), status: 422, answer: { message: 'Refused.', reasons } });

const takeIn = async <Extension>(deps: OperatorDeps<Extension>, id: string, url: string): Promise<Taken> => {
  let payload: unknown;
  try {
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

  const prepare = deps.extension?.prepare;
  if (prepare === undefined || result.extension === undefined) return { ok: true, bundle: result.bundle, extension: result.extension };
  try {
    return { ok: true, bundle: result.bundle, extension: await prepare(result.extension, extensionContextOf(result.bundle, context)) };
  } catch (error) {
    return refused([`extension: ${String(error)}`]);
  }
};

const register = <Extension>(deps: OperatorDeps<Extension>, routes: Hono<FeatureEnv>): void => {
  routes.post('/integrations', async (c) => {
    const sent: unknown = await c.req.json().catch(() => ({}));
    const { id, url } = RegisterBodySchema.parse(sent);
    if (id === '' || url === '') return c.json({ message: 'Give an id and a url.' }, 400);
    if (!INTEGRATION_ID.test(id)) return c.json({ message: INTEGRATION_ID_RULE }, 400);

    const taken = await takeIn(deps, id, url);
    if (!taken.ok) {
      await recordFailedImport(deps.replay, id, url, taken.error);
      return c.json(taken.answer, taken.status);
    }

    const { approved: wasApproved, holdsKey } = await registrationOf(deps.replay, id);
    // Asked before anything is written: rows the app cannot be served with would take it down
    // until somebody deleted them by hand.
    if (wasApproved) {
      const refusal = deps.refusalOf({ ...deps.actions(), ...taken.bundle.actions });
      if (refusal !== undefined) return c.json({ message: 'Refused — the app would not serve this.', reasons: [`Error: ${refusal}`] }, 422);
    }

    const key = holdsKey ? undefined : mintIntegrationKey();

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
    return c.json({ id, status, actions: Object.keys(taken.bundle.actions).length, ...(key !== undefined && keptKey ? { key } : {}) });
  });
};

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
      // Something changed what the app consists of between the question above and this reload. The
      // approval is set back, or every process that reads the rows next is refused them.
      const why = String(error);
      await setBackToPending(deps.replay, id, why);
      await deps.reload();
      return c.json({ message: 'Refused — the app would not serve this.', reasons: [why] }, 422);
    }
    return c.json({ id, status: 'approved', granted: requested });
  });
};

const probe = (deps: Pick<OperatorDeps, 'replay' | 'timeoutMs'>, routes: Hono<FeatureEnv>): void => {
  routes.post('/integrations/:id/probe', async (c) => {
    const id = c.req.param('id');
    const found = await findIntegration(deps.replay, id);
    if (found === undefined) return c.json({ message: 'No such integration.' }, 404);
    const sent: unknown = await c.req.json().catch(() => ({}));
    const path = ProbeBodySchema.parse(sent).path ?? 'bundle';
    if (path !== 'bundle' && !reachDeclares(found.reach, `/integrations/${id}/${path}`)) {
      return c.json({ message: 'That path is not one this integration declared.' }, 404);
    }
    const started = Date.now();
    try {
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

  routes.delete('/integrations/:id', async (c) => {
    const id = c.req.param('id');
    await removeIntegration(deps.replay, id);
    await deps.reload();
    return c.json({ id, removed: true });
  });

  probe(deps, routes);
  return routes;
};

export type Contract = {
  components: readonly LayoutPaletteEntry[];
  audiences: readonly string[];
  namespace: string;
  actionSchema: string;
  extension?: unknown;
};

// Asked by Standard JSON Schema, so it holds whichever copy of zod the kit built the schema with.
const convertsItself = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const standard: unknown = Reflect.get(value, '~standard');
  const converter: unknown = isRecord(standard) ? standard['jsonSchema'] : undefined;
  return isRecord(converter) && typeof converter['output'] === 'function';
};

const ComponentMetaSchema = z.object({
  description: z.string().optional().catch(undefined),
  propsSchema: z.custom<z.ZodType>(convertsItself).optional().catch(undefined),
});

const componentMetaOf = (meta: unknown): ComponentMeta => {
  const parsed = ComponentMetaSchema.safeParse(meta ?? {});
  return parsed.success ? parsed.data : {};
};

export type ContractHost = {
  components: Readonly<Record<string, { meta?: unknown }>>;
  charter: Charter;
  extension?: unknown;
};

export const buildContract = (host: ContractHost, integrationId: string): Contract => {
  const registered = host.components;
  const components = Object.keys(registered)
    .sort()
    .map((name) => paletteEntryOf(name, componentMetaOf(registered[name]?.meta)));
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

export type ContractDeps = {
  host: ContractHost;
  fingerprintsFor: (principal: string | null) => Promise<readonly string[]>;
  verifyKey: string;
};

export const contractRoutes = (deps: ContractDeps): Hono<FeatureEnv> => {
  const routes = new Hono<FeatureEnv>();

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

  routes.get('/api/integrations/verify-key', (c) => c.json({ alg: 'ed25519', key: deps.verifyKey }));

  return routes;
};
