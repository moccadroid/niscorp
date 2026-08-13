// Run: pnpm --filter lyra exec tsx src/dev/reachable-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { mutationEffect } from '@niscorp/vex';
import { ENTRIES, MUTATION_ENTRIES } from '@lyra/app/vex';
import { areasFor } from '@lyra/app/nav/sections';
import { CATALOG_DEFINITIONS } from '@lyra/app/action-catalog';
import { EFFECTS, MOMENTS } from '@lyra/app/reflexes/compose';
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

// ── AN ENTRY WITH NO CONSUMER IS INVISIBLE ───────────────────
//
// This check proved every ACTION a principal holds can be opened — and said
// nothing about the vex registry underneath. That is how `me/booked-sessions`
// sat granted, commented and uncalled for two reviews while the Book button
// beside it invited an error, and how the walk-in desk's reads were built,
// registered and unreachable. A grant is not a caller.
//
// A caller is one of: a prism in some action's endpoints (the resolved
// catalog names the fingerprint — this covers every `entry.fingerprint`
// reference a prism makes), or source OUTSIDE the registry naming the
// fingerprint literally — the tide driver, the server functions, the
// charter's machine rungs, the automation vocabulary, the integrations
// service and the admin tool all call by literal string. A check file does
// NOT count: the suites assert what was built, and "asserted by a check"
// was exactly the state the two orphans above rotted in.
const CATALOG_JSON = JSON.stringify(CATALOG_DEFINITIONS);
// The automation vocabulary names its selections by `entry.fingerprint`
// reference — resolved here, so the literal is present however it was spelt.
const VOCABULARY_JSON = JSON.stringify({ MOMENTS, EFFECTS });
const { readdirSync, readFileSync } = await import('node:fs');
const { join } = await import('node:path');
const sourceUnder = (root: string): string[] => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, item.name);
      if (item.isDirectory()) walk(at);
      else if (item.name.endsWith('.ts') || item.name.endsWith('.tsx')) files.push(at);
    }
  };
  walk(root);
  return files;
};
const OUTSIDE_THE_REGISTRY = [
  ...sourceUnder('src/app').filter((file) => !file.includes(join('src', 'app', 'vex'))),
  ...sourceUnder('src/server'),
  ...sourceUnder('../lyra-integrations/src'),
  ...sourceUnder('../lyra-admin/src'),
]
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

// Deliberately unwired, the reason on the row. Every entry here is a
// DECISION somebody can disagree with — which is the point; the drift this
// replaces could not be disagreed with because nobody could see it.
const DELIBERATE: Record<string, string> = {
  'staff/byId': 'harness-only today (roles flow) — no product screen opens one staff row yet',
  'automations/runs': 'the run history read — the Automations screen shows last_run from the list instead; candidate for a detail screen or deletion',
  'people/byEmail': 'the identity plan replaced its login use with server/identity.ts; kept for the next surface that resolves an address',
  'people/create': 'superseded by people/add on the intake form; delete with the next registry sweep',
  'bookings/cancel': 'the desk cancels nothing yet — members cancel their own (me/cancel); a desk verb needs a decision about notice',
  'sessions/cancel': 'NO SCREEN OFFERS IT — the studio cannot call a class off today (defect 1.1 simulated it in SQL); wire it to the session screen next',
  'sessions/restore': 'the undo of sessions/cancel; lands with it',
  'automation/outbox-stuck': 'the mid-send-death sweep read — the server sweep inlines its SQL today; converge or delete',
  'staff/create': 'harness plumbing — acl-check and tide-check mint staff to test roles; the staff screen enrols via staff/enroll',
  'people/add': 'the wire-level signup intake-check exercises; the people form enrols via people/enroll — converge or delete',
};

const consumed = (fingerprint: string): boolean =>
  CATALOG_JSON.includes(`"${fingerprint}"`) ||
  VOCABULARY_JSON.includes(`"${fingerprint}"`) ||
  OUTSIDE_THE_REGISTRY.includes(`'${fingerprint}'`) ||
  OUTSIDE_THE_REGISTRY.includes(`"${fingerprint}"`) ||
  DELIBERATE[fingerprint] !== undefined;

const registry = [...ENTRIES, ...MUTATION_ENTRIES].map((entry) => entry.fingerprint);
const unwired = registry.filter((fingerprint) => !consumed(fingerprint));
ok(
  'every entry in the registry has a caller',
  unwired.length === 0,
  unwired.length > 0 ? `unwired: ${unwired.join(', ')}` : `${registry.length} entries, each consumed or deliberately listed`,
);
ok('...and the rule would catch a fresh orphan', !consumed('ghost/read'), 'a fingerprint nothing references anywhere');
ok(
  '...and the deliberate list holds only strangers',
  Object.keys(DELIBERATE).every(
    (fingerprint) =>
      registry.includes(fingerprint) &&
      !CATALOG_JSON.includes(`"${fingerprint}"`) &&
      !VOCABULARY_JSON.includes(`"${fingerprint}"`) &&
      !OUTSIDE_THE_REGISTRY.includes(`'${fingerprint}'`) &&
      !OUTSIDE_THE_REGISTRY.includes(`"${fingerprint}"`),
  ),
  'an entry that GAINED a caller must leave the list, or the list rots the other way',
);

report('every grant has a destination, every destination has a grant, every reaction has a write — and every entry has a caller.');
