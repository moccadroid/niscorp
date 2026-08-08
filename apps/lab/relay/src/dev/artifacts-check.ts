// Artifacts check — the invariant that makes `src/app/` a picture of the
// artifact library: everything the manifest carries as DATA is PURE JSON and
// parses through its own schema. This is what "these are JSON files with
// comments" means, enforced instead of hoped: a function, a Date, an
// undefined, a class instance anywhere in an artifact fails here — so a code
// file cannot masquerade as an artifact, and the whole tree stays row-ready
// for the library (moss DESIGN.md § Deployment is a data operation:
// publishing is a write to the library).
//
// The manifest's two CODE fields — `functions` (server fns) and
// `shell.inputs` (the one derivation hook) — are deliberately NOT artifacts;
// they are validated by running, not by this check, and are never asserted
// pure here.
import { ActionDefinitionSchema, ActionFragmentSchema, LayoutNodeSchema } from '@niscorp/nova';
import { QuerySchema, MutationDefinitionSchema } from '@niscorp/vex';
import { CHARTER, ASSIGNMENTS } from '@relay/app/charter';
import { CATALOG_DEFINITIONS } from '@relay/app/action-catalog';
import { LAYOUT_VARIANTS } from '@relay/app/layout-variants';
import { ENTRIES, MUTATION_ENTRIES } from '@relay/app/vex';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { RESOURCES } from '@relay/app/vex/resources';
import { frameLayout } from '@relay/app/shell/frame.layout';
import { mainStackLayout, asideStackLayout } from '@relay/app/shell/stack-nav.layout';
import { modalFragment } from '@relay/app/shell/fragments/modal.fragment';
import { quickviewFragment } from '@relay/app/shell/fragments/quickview.fragment';
import { panelFragment } from '@relay/app/shell/fragments/panel.fragment';
import { dockFragment } from '@relay/app/shell/fragments/dock.fragment';

const checks: [string, boolean][] = [];

// A pure-JSON tree: every node a plain object or array, every leaf a
// string / number / boolean / null. Returns the first offending path, or
// '' if the value is pure — a function/Date/undefined/Map/class instance
// (anything JSON can't round-trip losslessly) is a violation with a path.
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
  // Plain objects only — a Date, Map, Set, or class instance has a
  // non-Object prototype and is not an artifact.
  if (Object.getPrototypeOf(value) !== Object.prototype) return `${path} is a non-plain object (${(value as object).constructor?.name ?? 'unknown'})`;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const found = impurity(v, path === '' ? k : `${path}.${k}`);
    if (found !== '') return found;
  }
  return '';
};

// Assert a whole labelled collection is pure JSON; on the first impurity,
// fail the check with its path.
const pure = (label: string, value: unknown): void => {
  const found = impurity(value, '');
  checks.push([found === '' ? `${label} is pure JSON` : `${label} — IMPURE: ${found}`, found === '']);
};

// ── every artifact field of the manifest is pure JSON ──
pure('actions', CATALOG_DEFINITIONS);
pure('layout variants', LAYOUT_VARIANTS);
pure('charter', CHARTER);
pure('assignments', ASSIGNMENTS);
pure('read entries', ENTRIES);
pure('mutation entries', MUTATION_ENTRIES);
pure('behaviors', scopeBehaviors);
pure('resources', RESOURCES);
pure('shell frame', frameLayout);
pure('stack layouts', [mainStackLayout, asideStackLayout]);
pure('fragments', [modalFragment, quickviewFragment, panelFragment, dockFragment]);

// ── and parses through its own schema (validated at the boundary) ──
const parses = (label: string, fn: () => void): void => {
  try {
    fn();
    checks.push([`${label} parse its schema`, true]);
  } catch (e) {
    checks.push([`${label} — SCHEMA FAIL: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`, false]);
  }
};

parses('actions', () => {
  for (const def of Object.values(CATALOG_DEFINITIONS)) ActionDefinitionSchema.parse(def);
});
parses('layout variants', () => {
  for (const v of Object.values(LAYOUT_VARIANTS)) LayoutNodeSchema.parse(v.layout);
});
parses('fragments', () => {
  for (const f of [modalFragment, quickviewFragment, panelFragment, dockFragment]) ActionFragmentSchema.parse(f);
});
parses('shell frame + stack layouts', () => {
  for (const l of [frameLayout, mainStackLayout, asideStackLayout]) LayoutNodeSchema.parse(l);
});
parses('read-entry DSLs', () => {
  for (const e of ENTRIES) QuerySchema.parse(e.dsl);
});
parses('mutation-entry definitions', () => {
  for (const m of MUTATION_ENTRIES) MutationDefinitionSchema.parse(m.mutation);
});

// ── report ──
let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
}
if (failed > 0) {
  console.log(`\nFAIL — ${failed} check(s). An artifact is not pure data, or does not match its schema.`);
  process.exit(1);
}
console.log('\nOK — every manifest artifact is pure JSON and parses its schema. src/app/ is row-ready.');
