import { Hono } from 'hono';
import { z } from 'zod';
import type { Charter } from '@niscorp/charter';
import { paletteEntryOf } from '@niscorp/nova';
import type { ComponentMeta, LayoutPaletteEntry } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import type { FeatureEnv } from '../feature';

// ── the contract an integration is built against ─────────────
//
// With no shared code, an author cannot import a fingerprint constant or a
// component name. This is what replaces those imports: the same information,
// over the wire, in the two formats somebody might want it in.
export type Contract = {
  // Each component the author may compose, with its description and — where the
  // app carried one — its props as a draft-7 JSON Schema derived from the same
  // Zod schema the renderer validates against. A component the app registered
  // with no meta appears as its name alone, exactly as the whole list used to.
  components: readonly LayoutPaletteEntry[];
  audiences: readonly string[];
  namespace: string;
  actionSchema: string;
  // The placement vocabulary: which host actions offer a seat (and what they
  // hand a rider), and which menu hubs accept placed screens.
  attachable: Record<string, readonly string[]>;
  menuSlots: readonly string[];
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
// the server knows, and the seats and hubs the app named when it created the
// feature.
export type ContractHost = {
  components: Readonly<Record<string, { meta?: unknown }>>;
  charter: Charter;
  attachable?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  menuSlots?: readonly string[];
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
  // Only the offered KEYS are advertised — the host's data paths are its
  // private wiring, not part of any contract an author builds against.
  const attachable: Record<string, readonly string[]> = {};
  for (const [action, offers] of Object.entries(host.attachable ?? {})) attachable[action] = Object.keys(offers);
  return {
    components,
    audiences: [...audiences].sort(),
    namespace: `ext.<audience>.${integrationId}.<name>`,
    actionSchema: 'nova ActionDefinition',
    attachable,
    menuSlots: [...(host.menuSlots ?? [])],
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
// props renders as its name alone, which is what the whole list used to be.
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
    `## Where your screens may appear`,
    ``,
    `Declare \`attachments\` (action → host action) to ride a host screen, and`,
    `\`placements\` (action → hub) to list under a menu hub. \`settings\` names the one`,
    `action the store tile opens. Anything else is refused.`,
    ``,
    `Attachable, with what each hands you as input:`,
    ``,
    Object.entries(contract.attachable)
      .map(([action, offers]) => `- ${action} — offers ${offers.join(', ') || '(nothing)'}`)
      .join('\n') || '(none)',
    ``,
    `Menu hubs accepting placements:`,
    ``,
    contract.menuSlots.map((hub) => `- ${hub}`).join('\n') || '(none)',
    ``,
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
  // The fingerprints somebody may be told of.
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
