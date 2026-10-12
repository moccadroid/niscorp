import { ActionDefinitionSchema, ActionFragmentSchema, LayoutNodeSchema } from '@niscorp/nova';
import { QuerySchema, MutationDefinitionSchema } from '@niscorp/vex';
import { CHARTER, ASSIGNMENTS } from '@atrium/app/charter';
import { CATALOG_DEFINITIONS } from '@atrium/app/action-catalog';
import { ENTRIES, MUTATION_ENTRIES } from '@atrium/app/vex';
import { scopeBehaviors } from '@atrium/app/vex/behaviors';
import { RESOURCES } from '@atrium/app/vex/resources';
import { frameLayout } from '@atrium/app/shell/frame.layout';
import { sheetFragment } from '@atrium/app/shell/fragments/sheet.fragment';
import { detailFragment } from '@atrium/app/shell/fragments/detail.fragment';
import { BUNDLES } from '@atrium/integrations';
import { bundlePayload } from '../integrations/service';
import { intakeBundle } from '../server/intake';
import { TABLES } from '@atrium/db/schema';
import { CAPABILITIES, SLOTS } from '@atrium/db/seed';

const checks: [string, boolean][] = [];

const impurity = (value: unknown, path: string): string => {
  if (value === null) return '';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return '';
  if (t === 'function' || t === 'undefined' || t === 'symbol' || t === 'bigint') return `${path} is ${t}`;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = impurity(value[i], `${path}[${i}]`);
      if (found !== '') return found;
    }
    return '';
  }
  // Narrowed on `value`, not on `t`: the compiler does not narrow `value`
  // through a typeof result copied into a variable.
  if (typeof value !== 'object' || value === null) return `${path} is ${t}`;
  if (Object.getPrototypeOf(value) !== Object.prototype) return `${path} is a non-plain object`;
  for (const [k, v] of Object.entries(value)) {
    const found = impurity(v, path === '' ? k : `${path}.${k}`);
    if (found !== '') return found;
  }
  return '';
};

const pure = (label: string, value: unknown): void => {
  const found = impurity(value, '');
  checks.push([found === '' ? `${label} is pure JSON` : `${label} — IMPURE: ${found}`, found === '']);
};

pure('actions', CATALOG_DEFINITIONS);
pure('charter', CHARTER);
pure('assignments', ASSIGNMENTS);
pure('read entries', ENTRIES);
pure('mutation entries', MUTATION_ENTRIES);
pure('behaviors', scopeBehaviors);
pure('resources', RESOURCES);
pure('shell frame', frameLayout);
pure('fragments', [sheetFragment, detailFragment]);

const parses = (label: string, fn: () => void): void => {
  try {
    fn();
    checks.push([`${label} parse their schema`, true]);
  } catch (e) {
    checks.push([`${label} — SCHEMA FAIL: ${e instanceof Error ? (e.message.split('\n')[0] ?? '') : String(e)}`, false]);
  }
};

parses('actions', () => {
  for (const def of Object.values(CATALOG_DEFINITIONS)) ActionDefinitionSchema.parse(def);
});
parses('fragments', () => {
  ActionFragmentSchema.parse(sheetFragment);
  ActionFragmentSchema.parse(detailFragment);
});
parses('shell frame', () => {
  LayoutNodeSchema.parse(frameLayout);
});
parses('read-entry DSLs', () => {
  for (const e of ENTRIES) QuerySchema.parse(e.dsl);
});
parses('mutation-entry definitions', () => {
  for (const m of MUTATION_ENTRIES) MutationDefinitionSchema.parse(m.mutation);
});

{
  const bareGets = (mapping: unknown): string[] => {
    const bare: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (node === null || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      const get = record['$get'];
      if (get !== null && typeof get === 'object' && !('fallback' in (get as Record<string, unknown>))) {
        bare.push(JSON.stringify((get as Record<string, unknown>)['path']));
      }
      for (const value of Object.values(record)) walk(value);
    };
    walk(mapping);
    return bare;
  };

  // An ungrouped aggregate always returns exactly one row (`SUM` over nothing
  // is one row holding NULL), so `$.result` is never null there.
  const canBeEmpty = (entry: (typeof ENTRIES)[number]): boolean => {
    if (entry.shape === undefined || Array.isArray(entry.shape)) return false;
    const dsl = entry.dsl as { aggregate?: unknown; groupBy?: unknown[] } | undefined;
    return dsl?.aggregate === undefined || (dsl.groupBy !== undefined && dsl.groupBy.length > 0);
  };

  const unguarded = ENTRIES.filter(canBeEmpty)
    .map((entry) => [entry.fingerprint, bareGets(entry.mapping)] as const)
    .filter(([, bare]) => bare.length > 0)
    .map(([fingerprint, bare]) => `${fingerprint} (${bare.join(', ')})`);
  checks.push([
    unguarded.length === 0
      ? 'every single-row read answers its empty shape rather than throwing'
      : `single-row reads whose \`$get\` has no fallback — these 500 on an empty result:\n    ${unguarded.join('\n    ')}`,
    unguarded.length === 0,
  ]);

  const stripped = JSON.parse(JSON.stringify(ENTRIES.find((e) => e.fingerprint === 'stay/byId')?.mapping ?? {})) as Record<string, unknown>;
  const firstField = ((stripped['$with'] as { value?: Record<string, Record<string, Record<string, unknown>>> })?.value ?? {})['stay_id'];
  if (firstField?.['$get'] !== undefined) delete firstField['$get']['fallback'];
  checks.push([
    bareGets(stripped).length > 0
      ? 'the lint bites: a stripped fallback is caught'
      : 'the lint does NOT bite — a stripped fallback went unnoticed',
    bareGets(stripped).length > 0,
  ]);
}

for (const [id, def] of Object.entries(CATALOG_DEFINITIONS)) {
  const input = def.input;
  if (input === undefined) continue;
  const properties = (input as { properties?: Record<string, unknown> }).properties ?? {};
  const dataKeys = new Set(Object.keys(def.data ?? {}));
  const orphans = Object.keys(properties).filter((k) => !dataKeys.has(k));
  checks.push([
    orphans.length === 0 ? `${id}: input ⊆ data (${Object.keys(properties).length} fields)` : `${id}: input declares keys data lacks — ${orphans.join(', ')}`,
    orphans.length === 0,
  ]);
}

for (const bundle of BUNDLES) {
  pure(`bundle ${bundle.connector} actions`, bundle.actions);
  pure(`bundle ${bundle.connector} entries`, [...bundle.entries, ...bundle.mutations]);
  pure(`bundle ${bundle.connector} slots+options`, [...bundle.slots, ...bundle.options]);
}

{
  type WirePayload = { actions: Record<string, unknown>; queries: { fingerprint: string }[]; mutations: { fingerprint: string }[]; slots: unknown[][] };
  const VENDORS: [string, string][] = [
    ['opera', 'con_opera'],
    ['mews', 'con_mews'],
    ['hotelfix', 'con_ticketing'],
  ];
  const payloads = new Map(VENDORS.map(([vendor, connector]) => [connector, bundlePayload(vendor)]));

  const contextFor = (connector: string): Parameters<typeof intakeBundle>[1] => {
    const others = VENDORS.filter(([, c]) => c !== connector).map(([, c]) => payloads.get(c) as WirePayload);
    return {
      connectorId: connector,
      coreFingerprints: new Set([...ENTRIES, ...MUTATION_ENTRIES].map((e) => e.fingerprint)),
      foreignFingerprints: new Set(others.flatMap((p) => [...p.queries, ...p.mutations].map((e) => e.fingerprint))),
      foreignActionIds: new Set(others.flatMap((p) => Object.keys(p.actions))),
      foreignSlotIds: new Set([...SLOTS.map((s) => s[1]), ...others.flatMap((p) => p.slots.map((s) => String(s[1])))]),
      capabilityVocabulary: new Set(CAPABILITIES.map(([id]) => id)),
      schemaTables: new Set(TABLES),
    };
  };

  for (const [, connector] of VENDORS) {
    const { errors } = intakeBundle(payloads.get(connector), contextFor(connector));
    checks.push([errors.length === 0 ? `${connector}: the served payload passes intake` : `${connector}: intake refuses —\n    ${errors.join('\n    ')}`, errors.length === 0]);
  }

  const broken = (mutate: (p: WirePayload & Record<string, unknown>) => void): string[] => {
    const copy = JSON.parse(JSON.stringify(payloads.get('con_opera'))) as WirePayload & Record<string, unknown>;
    mutate(copy);
    return intakeBundle(copy, contextFor('con_opera')).errors;
  };
  const refuses = (what: string, needle: string, errors: string[]): void => {
    const hit = errors.some((e) => e.includes(needle));
    checks.push([hit ? `intake refuses ${what}` : `intake ACCEPTS ${what} — the gate is not biting`, hit]);
  };

  refuses(
    'an endpoint aimed at another connector',
    'reaches /connectors/con_mews/spa/slots',
    broken((p) => {
      ((p.actions['ext.guest.opera.wake'] as { endpoints: Record<string, unknown> }).endpoints['loadTimes'] as { url: string }).url = '/connectors/con_mews/spa/slots';
    }),
  );
  refuses(
    'an in-process fn: call',
    'bundles ship data, not in-process code',
    broken((p) => {
      (p.actions['ext.guest.opera.wake'] as { endpoints: Record<string, unknown> }).endpoints['loadTimes'] = { fn: 'connector.issueKey' };
    }),
  );
  refuses(
    'a write outside the declared footprint',
    'which the bundle does not declare in tables',
    broken((p) => {
      p['tables'] = ['stay_requests'];
    }),
  );
  refuses(
    'a fingerprint that collides with core',
    'collides with a core entry',
    broken((p) => {
      const first = p.queries[0];
      if (first !== undefined) first.fingerprint = 'folio/total';
    }),
  );
  refuses(
    'a guest surface with no crew half',
    'guest half only',
    broken((p) => {
      p['slots'] = p.slots.filter((s) => s[0] === 'guest');
    }),
  );
  refuses(
    'a capability outside our vocabulary',
    "not in the app's vocabulary",
    broken((p) => {
      (p['capabilities'] as { id: string }[]).push({ id: 'opera.magic', version: 1, enabled: true } as never);
    }),
  );
}

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
}
if (failed > 0) {
  console.log(`\nFAIL — ${failed} check(s). An artifact is impure, breaks its schema, or lies about its inputs.`);
  process.exit(1);
}
console.log('\nOK — every manifest artifact is pure JSON, parses its schema, and declares an honest input contract.');
