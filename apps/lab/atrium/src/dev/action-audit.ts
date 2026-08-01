// THE ACTION AUDIT — which actions are monoliths, and why.
//
// Not a check (it would fail the suite today). A migration instrument: run it
// after each phase and the offender list shrinks. Three defects, all read
// straight off the artifacts:
//
//   NO TYPE    the id does not end in one of the five types, so nothing can
//              derive its canvas, its composition, or how the agent should use
//              it. Doubles as the "not yet migrated" marker.
//   ROOT IF    the layout branches at its root — one action wearing two faces.
//              This is the `previewable()` collapsible pattern, and it is where
//              the sprawl comes from.
//   UNREACHABLE a state a FINGER can put the action into that an OPENER cannot:
//              a key written by a `ui:` trigger, not filled by an endpoint, and
//              not in the declared input. No push, no deep link and no agent can
//              reach it. This is the one that made the watcher unable to open an
//              issue, and it is measured rather than guessed — an earlier pass
//              matched key NAMES and called a count of open issues a subject.
//
// Run: pnpm --filter atrium exec tsx src/dev/action-audit.ts
import type { ActionDefinition } from '@niscorp/nova';
import { CATALOG_DEFINITIONS } from '../app/action-catalog';
import { BUNDLES } from '../integrations';
import { gesturedKeys, loadedKeys, declaredKeys } from '@niscorp/nova/reflect';

const TYPES = ['menu', 'tile', 'list', 'detail', 'form'] as const;

// Everything the app can serve: what it ships, plus what the vendors do.
const universe: Record<string, ActionDefinition> = { ...CATALOG_DEFINITIONS };
for (const bundle of BUNDLES) for (const [id, definition] of Object.entries(bundle.actions)) universe[id] = definition;

// Staff/back-of-house first, by decision. The rest is reported so the whole
// picture is visible, but it is not this pass's work.
const STAFF = ['desk', 'service', 'ops'];
const audienceOf = (id: string): string => {
  const parts = id.split('.');
  return parts[0] === 'ext' ? (parts[1] ?? '?') : (parts[0] ?? '?');
};

// Measured, not guessed: what a finger can set, minus what the database fills,
// minus what an opener is allowed to pass. Whatever is left is state only a
// human standing at the screen can produce.
const unreachableKeys = (definition: ActionDefinition): string[] => {
  const loaded = new Set(loadedKeys(definition));
  const declared = new Set(declaredKeys(definition));
  const data = (definition.data ?? {}) as Record<string, unknown>;
  return gesturedKeys(definition).filter((key) => {
    if (loaded.has(key) || declared.has(key)) return false;
    // In-flight flags (`working`, `done`, `slotsLoading`) are booleans the action
    // flips around its own calls. They SHOULD be unreachable — an opener has no
    // business claiming a request is in progress. A choice or a record is a
    // different thing, and that is what a boolean default separates.
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
// The headline number: surfaces holding a record nobody can hand them.
const blocked = findings.filter((f) => f.unaddressable.length > 0);
console.log(`\n── the actions no push, link or agent can aim (${blocked.length})`);
for (const row of blocked) console.log(`  ${row.id} — ${row.unaddressable.join(', ')}`);
