// EVERY GRANT HAS A DESTINATION.
//
// Three screens were granted to somebody and openable by nobody, and each was
// found by hand:
//
//   `me.membership`   a teacher who trains here held their card on a LANDING
//                     surface, and they land on the instructor's day
//   `schedule.timetable`  an instructor held `schedule.*` without `hub.schedule`
//   `courses.list`    replaced by the merged Classes screen, left in the catalog
//                     and in the charter, reachable only by a dev check
//                     dispatching a nav event the nav never sends
//
// One fault: ring 1 says what a principal MAY do, and nothing said whether they
// could get there. A grant with no destination looks identical to a working
// feature from inside the charter, and identical to a missing one from inside
// the app.
//
// This is the check that would have caught all three on the day they appeared.
//
// Run: pnpm --filter lyra exec tsx src/dev/reachable-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { areasFor } from '@lyra/app/nav/sections';
import { CATALOG_DEFINITIONS } from '@lyra/app/action-catalog';
import { CAST } from '@lyra/db/seed';
import { personByEmail } from '@lyra/server/users';
import { app, ok, report } from './world';

// Every action any other action can push. A sheet is a destination too — it is
// just one reached from a row rather than from the menu.
const PUSHED = new Set<string>();
for (const def of Object.values(CATALOG_DEFINITIONS)) {
  for (const id of JSON.stringify(def.triggers ?? []).matchAll(/"action":"([^"]+)"/g)) PUSHED.add(id[1] ?? '');
  for (const id of JSON.stringify(def.lifecycle ?? {}).matchAll(/"action":"([^"]+)"/g)) PUSHED.add(id[1] ?? '');
}

// Reached by being landed on, or by being the frame — neither of which the menu
// lists as an item. (`hub.*` used to be here too. Hub screens are gone: an area
// is a name in a table now, not an action, so there is nothing to exempt.)
const STRUCTURAL = (id: string): boolean => id.startsWith('home.') || id.startsWith('chrome.') || id === 'confirm';

// `CAST.lumen` carries the studio id alongside the people; only the people have
// a catalog. An unknown email resolves to the ANONYMOUS principal, whose one
// action is the sign-in screen — which is its own landing surface.
const CAST_PEOPLE = Object.entries(CAST.lumen).filter(([who]) => who !== 'studio');

// THE SAME NAV THE APP BUILDS. Integration screens are PLACED into hubs by
// their bundles now (folded in by `nav.hub` at runtime) — this cast holds no
// installs, so the static table is the whole menu; the placed path is what
// `integrations-check` drives.
const navFor = (granted: readonly string[]) => areasFor(granted);

const orphansFor = (email: string): string[] => {
  const ids = resolveCatalog(app, personByEmail(email)?.id ?? null).ids;
  const nav = new Set(navFor(ids).flatMap((a) => [a.id, ...a.items.map((i) => i.action)]));
  return ids.filter((id) => !nav.has(id) && !STRUCTURAL(id) && !PUSHED.has(id));
};

for (const [who, email] of CAST_PEOPLE) {
  const orphans = orphansFor(email);
  ok(`everything the ${who} holds can be opened`, orphans.length === 0, orphans.length > 0 ? `unreachable: ${orphans.join(', ')}` : 'menu, sheet, or landing');
}

// FALSIFIABLE. The check above passes trivially if `orphansFor` cannot see
// anything — so prove it reports a real orphan when one exists.
const ids = resolveCatalog(app, personByEmail(CAST.lumen.owner)?.id ?? null).ids;
const invented = [...ids, 'ghost.screen'];
const navIds = new Set(navFor(invented).flatMap((a) => [a.id, ...a.items.map((i) => i.action)]));
ok(
  'and the check can actually see an orphan',
  invented.filter((id) => !navIds.has(id) && !STRUCTURAL(id) && !PUSHED.has(id)).includes('ghost.screen'),
  'a granted id in no menu, no sheet and no landing slot',
);

// The other direction: a menu offering something nobody holds renders a button
// that mounts nothing. `areasFor` filters on the catalog, so this asserts the
// filter rather than hoping.
for (const [who, email] of CAST_PEOPLE) {
  const held = new Set(resolveCatalog(app, personByEmail(email)?.id ?? null).ids);
  const offered = navFor([...held]).flatMap((a) => a.items.map((i) => i.action));
  const dead = offered.filter((id) => !held.has(id));
  ok(`the ${who}'s menu offers nothing they do not hold`, dead.length === 0, dead.join(', ') || 'every item leads somewhere');
}

// And every id the menu names has to EXIST — a typo in the nav table is a
// button that resolves to nothing, which ring 1 cannot catch because a charter
// knows nothing about a nav.
const named = navFor(Object.keys(CATALOG_DEFINITIONS)).flatMap((a) => a.items.map((i) => i.action));
const missing = named.filter((id) => CATALOG_DEFINITIONS[id] === undefined);
ok('every destination the menu names is a real action', missing.length === 0, missing.join(', ') || `${named.length} checked`);

report('every grant has a destination, and every destination has a grant.');
