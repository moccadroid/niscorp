// KIT CHECK — the kit's props are a grammar (`lyceum.kit`, AGENTS.md rule 18).
//
// 1. The kit's prop schema (src/ui/kit.props.ts) is snapshotted at each version
//    of LYCEUM_KIT (strata/snapshots/lyceum.kit/<n>.json). Same version, a
//    different schema → red: append a migration to LYCEUM_KIT (an empty marker
//    for an addition; steps that rewrite the layout nodes for anything else),
//    then record the new version with `pnpm kit:snapshot`.
// 2. Every layout the app carries — actions, fragments, the frame, the canvases'
//    action layouts — names only components the kit has, and passes each only
//    props that component declares. Values are not typed here (a layout binds
//    most of them to data); the names are what drift.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareSnapshot, snapshotOf, snapshotText, type Snapshot } from '@niscorp/strata/check';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { LYCEUM_KIT } from '@lyceum/app/grammars';
import { FRAGMENTS } from '@lyceum/app/shell/fragments/sheet.fragment';
import { frameLayout } from '@lyceum/app/shell/frame.layout';
import { CANVASES } from '@lyceum/app/shell/canvases';
import { KIT_PROPS } from '@lyceum/ui/kit.props';
import { check, finish } from './harness';

const write = process.argv.includes('--write');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// ── 1. the snapshot ──
const current = snapshotOf(LYCEUM_KIT, { 'lyceum.kit/props': KIT_PROPS });
const file = fileURLToPath(new URL(`../../strata/snapshots/lyceum.kit/${current.version}.json`, import.meta.url));
const readSnapshot = (): Snapshot | undefined => {
  if (!existsSync(file)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(raw) || typeof raw['sequence'] !== 'string' || typeof raw['version'] !== 'number' || !isRecord(raw['kinds'])) throw new Error(`${file} is not a snapshot`);
  return { sequence: raw['sequence'], version: raw['version'], kinds: raw['kinds'] };
};
const result = compareSnapshot(readSnapshot(), current);
if (result.status === 'missing' && write) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, snapshotText(current));
}
const detail = result.status === 'changed' ? `: ${result.changes.flatMap((c) => c.lines).slice(0, 6).join('; ')} — append a migration to LYCEUM_KIT, then pnpm kit:snapshot` : '';
check(
  result.status === 'missing' && !write
    ? `lyceum.kit is at ${current.version} and nothing records what that means — pnpm kit:snapshot`
    : `the kit's props match lyceum.kit/${current.version}${detail}`,
  result.status === 'same' || (result.status === 'missing' && write),
);

// ── 2. every layout speaks the kit ──
const STRUCTURE = new Set(['CanvasSlot', 'ActionSlot']);
// Props the RENDERER reads by nova's convention, on any component: a `ref`'d
// node's `value` is its click payload, a `model`'d node's `debounce` paces its
// typing. They are nova's grammar, not the kit's.
const conventional = (node: Record<string, unknown>): string[] => [...(node['ref'] === undefined ? [] : ['value']), ...(node['model'] === undefined ? [] : ['debounce'])];
const declared = new Map(Object.entries(KIT_PROPS.shape).map(([name, schema]) => [name, new Set(Object.keys(schema.shape))]));
const problems: string[] = [];

const walk = (node: unknown, where: string): void => {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, where);
    return;
  }
  if (!isRecord(node)) return;
  const name = node['component'];
  if (typeof name === 'string' && !STRUCTURE.has(name)) {
    const props = declared.get(name);
    if (props === undefined) problems.push(`${where}: no kit component "${name}"`);
    else {
      const allowed = new Set([...props, ...conventional(node)]);
      for (const key of Object.keys(isRecord(node['props']) ? node['props'] : {})) if (!allowed.has(key)) problems.push(`${where}: ${name} has no prop "${key}"`);
    }
  }
  for (const key of ['children', 'then', 'else', 'do']) walk(node[key], where);
};

for (const action of Object.values(ACTIONS)) walk(action.layout, action.id);
for (const fragment of Object.values(FRAGMENTS)) walk(fragment.layout, `fragment ${fragment.id}`);
walk(frameLayout, 'the frame');
for (const canvas of CANVASES) walk(canvas.actionLayout, `canvas ${canvas.id}`);

check(`every layout names only kit components and their declared props${problems.length === 0 ? '' : ` — ${problems.slice(0, 8).join('; ')}`}`, problems.length === 0);

finish();
