import type { ActionDefinition } from '@niscorp/nova';
import { CATALOG_DEFINITIONS } from '../app/action-catalog';
import { BUNDLES } from '../integrations';
import { gesturedKeys, loadedKeys, declaredKeys } from '@niscorp/nova/reflect';

const TYPES = ['menu', 'tile', 'list', 'detail', 'form'] as const;

const universe: Record<string, ActionDefinition> = { ...CATALOG_DEFINITIONS };
for (const bundle of BUNDLES) for (const [id, definition] of Object.entries(bundle.actions)) universe[id] = definition;

const STAFF = ['desk', 'service', 'ops'];
const audienceOf = (id: string): string => {
  const parts = id.split('.');
  return parts[0] === 'ext' ? (parts[1] ?? '?') : (parts[0] ?? '?');
};

const unreachableKeys = (definition: ActionDefinition): string[] => {
  const loaded = new Set(loadedKeys(definition));
  const declared = new Set(declaredKeys(definition));
  const data = (definition.data ?? {}) as Record<string, unknown>;
  return gesturedKeys(definition).filter((key) => {
    if (loaded.has(key) || declared.has(key)) return false;
    // A boolean default marks an in-flight flag the action flips around its own
    // calls; an opener has no business setting one.
    return typeof data[key] !== 'boolean';
  });
};

const rootIf = (layout: unknown): boolean => layout !== null && typeof layout === 'object' && 'if' in (layout as Record<string, unknown>);

type Finding = { id: string; audience: string; noType: boolean; rootIf: boolean; unaddressable: string[]; collapsible: boolean };

const findings: Finding[] = Object.entries(universe)
  .map(([id, definition]): Finding => {
    return {
      id,
      audience: audienceOf(id),
      noType: !TYPES.some((type) => id.endsWith(`.${type}`)),
      rootIf: rootIf(definition.layout),
      unaddressable: unreachableKeys(definition),
      collapsible: declaredKeys(definition).includes('expanded'),
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const flag = (on: boolean, mark: string): string => (on ? mark : ' ');
const staff = findings.filter((f) => STAFF.includes(f.audience));
const rest = findings.filter((f) => !STAFF.includes(f.audience));

const table = (rows: Finding[]): void => {
  const width = Math.max(...rows.map((r) => r.id.length));
  for (const row of rows) {
    const marks = `${flag(row.noType, 'T')}${flag(row.rootIf, 'I')}${flag(row.collapsible, 'C')}${flag(row.unaddressable.length > 0, 'S')}`;
    const why = row.unaddressable.length > 0 ? `  a finger can set, an opener cannot: ${row.unaddressable.join(', ')}` : '';
    console.log(`  ${marks}  ${row.id.padEnd(width)}${why}`);
  }
};

console.log('\nT = id has no type   I = layout branches at its root   C = collapsible (expanded is input)   S = holds a subject it cannot be given\n');
console.log(`── STAFF / BACK OF HOUSE (${staff.length}) — this pass`);
table(staff);
console.log(`\n── EVERYTHING ELSE (${rest.length}) — later`);
table(rest);

const count = (rows: Finding[], pick: (f: Finding) => boolean): number => rows.filter(pick).length;
console.log('\n── totals');
for (const [label, rows] of [['staff', staff], ['all', findings]] as const) {
  console.log(
    `  ${label.padEnd(6)} ${rows.length} actions · no type ${count(rows, (f) => f.noType)} · root if ${count(rows, (f) => f.rootIf)} · collapsible ${count(rows, (f) => f.collapsible)} · unaddressable ${count(rows, (f) => f.unaddressable.length > 0)}`,
  );
}
const blocked = findings.filter((f) => f.unaddressable.length > 0);
console.log(`\n── the actions no push, link or agent can aim (${blocked.length})`);
for (const row of blocked) console.log(`  ${row.id} — ${row.unaddressable.join(', ')}`);
