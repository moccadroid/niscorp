// Artifacts check — the invariant that makes `src/app/` a picture of the
// artifact library: everything the manifest carries as DATA is PURE JSON and
// parses through its own schema. Enforced instead of hoped: a function, a
// Date, an undefined, a class instance anywhere in an artifact fails here, so
// a code file cannot masquerade as an artifact and the tree stays row-ready.
//
// The manifest's CODE fields — `functions`, `inputs` and `scope` (the
// per-principal derivation hooks) — are deliberately NOT artifacts; they are
// validated by running, not by this check.
//
// It also enforces rule 14: an action's `input` schema declares what an opener
// may seed, and every declared field must be a key of the action's `data` — a
// contract over keys that do not exist is a lie in a schema.
//
// Run: pnpm --filter atrium exec tsx src/dev/artifacts-check.ts
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

// A pure-JSON tree: every node a plain object or array, every leaf a
// string / number / boolean / null. Returns the first offending path, or ''
// if the value is pure.
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
  // Narrowed on `value`, not on `t`: the typeof result was copied into a
  // variable above, which severs it from the value for control-flow purposes,
  // so everything past here was still `unknown` as far as the compiler knew.
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

// ── every artifact field of the manifest is pure JSON ──
pure('actions', CATALOG_DEFINITIONS);
pure('charter', CHARTER);
pure('assignments', ASSIGNMENTS);
pure('read entries', ENTRIES);
pure('mutation entries', MUTATION_ENTRIES);
pure('behaviors', scopeBehaviors);
pure('resources', RESOURCES);
pure('shell frame', frameLayout);
pure('fragments', [sheetFragment, detailFragment]);

// ── and parses through its own schema ──
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

// ── a DETAIL read must survive finding nothing ──────────────
// A non-array `shape` tells vex to map the FIRST row, so it hands `$.result` as
// that row or as NULL when nothing matched. Prism's `$get` throws `E_TYPE` on
// null unless the node carries a `fallback`, which makes an empty detail read a
// 500 rather than an empty answer — and finding no row is ordinary: a guest
// between stays, an id that no longer exists, a row another tenant owns and the
// engine filtered out.
//
// Checkable straight off the artifact, which is why it is a lint and not a
// convention: `stay/current` and `stay/byId` were the two that shipped without
// fallbacks, and nothing would have caught the third.
{
  // Every `$get` in a mapping that states no absent value.
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

  // An UNGROUPED AGGREGATE always returns exactly one row — `SUM` over nothing
  // is one row holding NULL, not zero rows — so `$.result` is never null there
  // and a fallback would be cargo. Add a `groupBy` and the exemption correctly
  // lapses, because then it can match nothing.
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

  // And it BITES. Strip one fallback and the lint must catch it, or it is
  // decoration — the same posture as the intake refusals below.
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

// ── rule 14: every declared input field is a key of the action's data ──
// The `input` JSON Schema is the action's public contract for openers; a field
// with no matching data key can never land anywhere. Core only here — the
// bundles are held to the same rule by intake, below.
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

// ── the BUNDLES: pure, then through the REAL gate ──
// Purity is the authoring bar (a function or a Date anywhere refuses). Then
// the publish gate proper: the EXACT payload the service serves per vendor,
// through the app's own intake, with a context composed from the other
// vendors plus the core catalogs — so passing this check IS passing sync.
// Namespace, rule 14, endpoint convention, table footprint, both halves:
// all of it lives in intake now, checked once, enforced everywhere.
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

  // ── and the gate BITES ──
  // A gate nobody has seen refuse is a gate nobody has tested. Each case
  // takes the real Opera payload, breaks one thing the way a careless bundle
  // would, and asserts the reason comes back — the mistakes intake exists to
  // catch, proven caught.
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
    'reaches /integrations/con_mews/spa/slots',
    broken((p) => {
      ((p.actions['ext.guest.opera.wake'] as { endpoints: Record<string, unknown> }).endpoints['loadTimes'] as { url: string }).url = '/integrations/con_mews/spa/slots';
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

// ── report ──
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
