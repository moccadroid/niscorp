// Run: pnpm --filter lyra exec tsx src/dev/reachable-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { mutationEffect } from '@niscorp/vex';
import { MUTATION_ENTRIES } from '@lyra/app/vex';
import { areasFor } from '@lyra/app/nav/sections';
import { CATALOG_DEFINITIONS } from '@lyra/app/action-catalog';
import { CAST } from '@lyra/db/seed';
import { app, idFor, idsFor, ok, report } from './world';

const PUSHED = new Set<string>();
for (const def of Object.values(CATALOG_DEFINITIONS)) {
  for (const id of JSON.stringify(def.triggers ?? []).matchAll(/"action":"([^"]+)"/g)) PUSHED.add(id[1] ?? '');
  for (const id of JSON.stringify(def.lifecycle ?? {}).matchAll(/"action":"([^"]+)"/g)) PUSHED.add(id[1] ?? '');
}

const STRUCTURAL = (id: string): boolean => id.startsWith('home.') || id.startsWith('chrome.') || id === 'confirm';

const CAST_PEOPLE = Object.entries(CAST.lumen).filter(([who]) => who !== 'studio');

const navFor = (granted: readonly string[]) => areasFor(granted);

const orphansFor = async (email: string): Promise<string[]> => {
  const ids = (await idsFor(email));
  const nav = new Set(navFor(ids).flatMap((a) => [a.id, ...a.items.map((i) => i.action)]));
  return ids.filter((id) => !nav.has(id) && !STRUCTURAL(id) && !PUSHED.has(id));
};

for (const [who, email] of CAST_PEOPLE) {
  const orphans = await orphansFor(email);
  ok(`everything the ${who} holds can be opened`, orphans.length === 0, orphans.length > 0 ? `unreachable: ${orphans.join(', ')}` : 'menu, sheet, or landing');
}

// Falsifiable: the check above passes trivially if `orphansFor` sees nothing.
const ids = (await idsFor(CAST.lumen.owner));
const invented = [...ids, 'ghost.screen'];
const navIds = new Set(navFor(invented).flatMap((a) => [a.id, ...a.items.map((i) => i.action)]));
ok(
  'and the check can actually see an orphan',
  invented.filter((id) => !navIds.has(id) && !STRUCTURAL(id) && !PUSHED.has(id)).includes('ghost.screen'),
  'a granted id in no menu, no sheet and no landing slot',
);

for (const [who, email] of CAST_PEOPLE) {
  const held = new Set((await idsFor(email)));
  const offered = navFor([...held]).flatMap((a) => a.items.map((i) => i.action));
  const dead = offered.filter((id) => !held.has(id));
  ok(`the ${who}'s menu offers nothing they do not hold`, dead.length === 0, dead.join(', ') || 'every item leads somewhere');
}

const named = navFor(Object.keys(CATALOG_DEFINITIONS)).flatMap((a) => a.items.map((i) => i.action));
const missing = named.filter((id) => CATALOG_DEFINITIONS[id] === undefined);
ok('every destination the menu names is a real action', missing.length === 0, missing.join(', ') || `${named.length} checked`);

// ── A REACTION THAT WATCHES NOTHING IS A REACTION THAT NEVER RUNS ──
//
// The app declares what writes it reacts to by TABLE, and moss routes vex's
// write observer by matching that name. A table nothing writes is not an
// error anywhere — the reaction simply never fires, silently, forever.
//
// ⟲ It happened while this was being built: the add-on reaction named
// `addons`, and the mutation behind "install" writes `studio_integrations`.
// Nothing complained. The directory stopped resyncing, and the failure
// surfaced three checks away as a studio that could not see its own screens.
// The names are derived from the mutations themselves now, so a reaction
// naming a table no entry writes is loud, here, at boot.
const WRITTEN = new Set(MUTATION_ENTRIES.flatMap((entry) => mutationEffect(entry.mutation).map((effect) => effect.table)));
const declared = (app.reactions ?? []).map((reaction) => reaction.table);
const unwatchable = declared.filter((table) => !WRITTEN.has(table));
ok(
  'every write this app reacts to is a write it actually makes',
  unwatchable.length === 0,
  unwatchable.length > 0 ? `nothing writes: ${unwatchable.join(', ')}` : `${declared.length} reactions over ${WRITTEN.size} written tables`,
);
ok(
  '...and the rule would catch a typo',
  !WRITTEN.has('addons') && WRITTEN.has('studio_integrations'),
  'the exact pair that shipped broken: the plural nobody writes, and the table that install really touches',
);

report('every grant has a destination, every destination has a grant, and every reaction has a write.');
