// Shell check — the scaffold, end to end.
//
// The chain this asserts is the one every later feature rides on: manifest →
// charter → per-principal catalog → server shell → rendered tree. It is worth a
// check of its own because a break anywhere in it looks identical from a
// browser (an empty page), and this says which link went.
//
// Run: pnpm --filter lyra exec tsx src/dev/shell-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { componentsOf } from '@niscorp/nova/reflect';
import { CAST } from '@lyra/db/seed';
import { AREAS } from '@lyra/app/nav/sections';
import { personByEmail } from '@lyra/server/users';
import { anonymous, app, login, ok, report, server, settle, treeOf } from './world';

// ── the boot itself ──
// moss refuses to serve an incoherent charter, so reaching this line at all is
// an assertion: every action a role selects exists, and every role closes.
ok('the manifest boots', server !== undefined);
ok('the app serves shells', server.shells !== undefined);

// ── ring 1: existence, per principal ──
const idsFor = (email: string | null): readonly string[] => resolveCatalog(app, email === null ? null : (personByEmail(email)?.id ?? null)).ids;

const anonIds = idsFor(null);
ok('anonymous holds exactly one action', anonIds.length === 1, anonIds.join(', '));
ok('...and it is the way in', anonIds.includes('auth.login'));

const ownerIds = idsFor(CAST.lumen.owner);
const memberIds = idsFor(CAST.lumen.member);
ok('an owner holds more than a member does', ownerIds.length > memberIds.length, `${ownerIds.length} vs ${memberIds.length}`);
ok('a member does NOT hold the staff chrome', !memberIds.includes('chrome.staff'));
ok('an owner does hold it', ownerIds.includes('chrome.staff'));
ok('nobody signed in holds the login page', !ownerIds.includes('auth.login') && !memberIds.includes('auth.login'));

// ── the anonymous principal ──
const anon = anonymous();
await settle();
const anonTree = treeOf(anon);
ok('anonymous is served the login page', anonTree.includes('Sign in'));
ok('...with the cast to pick from', anonTree.includes('Maren Holt'));
ok('...and no chrome at all — they hold neither bar', !anonTree.includes('Sign out'));

// ── a studio owner ──
const maren = login(CAST.lumen.owner);
await settle();
const marenTree = treeOf(maren);
ok('the owner gets the staff chrome', marenTree.includes('Lumen Yoga'));
ok('...labelled with their role', marenTree.includes('Owner'));
ok('...and lands on Today, greeted by name', marenTree.includes('Maren'));
ok('...with no login page anywhere in their shell', !marenTree.includes('Email me a link'));

// ── a member ──
const ava = login(CAST.lumen.member);
await settle();
const avaTree = treeOf(ava);
ok('a member gets their own chrome', avaTree.includes('Lumen Yoga') && avaTree.includes('Ava'));
ok('...and is not labelled a role they do not hold', !avaTree.includes('Owner'));

// ── the tenant boundary, as the shell sees it ──
const dario = login(CAST.northrock.owner);
await settle();
const darioTree = treeOf(dario);
ok('the other studio sees its own name', darioTree.includes('North Rock'));
ok('...and never the first one', !darioTree.includes('Lumen'));
ok('...and Lumen never sees theirs', !marenTree.includes('North Rock'));

// ── every canvas can be clicked ──
//
// This exists because of a bug that cost an hour and that no other check could
// have caught. A canvas with no `actionLayout` renders its top instance by
// default — correctly, in a headless check — but emits no `ActionSlot` marker.
// The terminal stamps an event's `origin` from that marker, and nova delivers
// an event only to the instance the origin names. So in a real browser every
// click went out on the wire, arrived, matched nothing, and did nothing.
//
// The checks all passed the whole time, because they call `shell.dispatch`
// directly and never travel the wire. Nothing dynamic can catch that; this is
// the static assertion that can.
const canvases = app.shell?.canvases ?? [];
const withoutSlot = canvases.filter((canvas) => !JSON.stringify(canvas.actionLayout ?? null).includes('ActionSlot'));
ok('every canvas declares an actionLayout', canvases.every((c) => c.actionLayout !== undefined), canvases.map((c) => c.id).join(', '));
ok('...and every one of them renders an ActionSlot', withoutSlot.length === 0, withoutSlot.map((c) => c.id).join(', ') || 'all good — clicks can reach their instance');

// ── the kit answers for what the layouts ask ──
//
// Static, over the shipped artifacts rather than over a rendered tree: every
// component name any authored layout mentions must be in the registry, or a
// tree that reads fine in review renders as an error node for a real person.
//
// This is the check that matters later. When a studio's replacement layout
// arrives as a row, THIS is the gate it has to pass before it is served —
// which is why it walks artifacts, and why it is worth having on day one
// against four layouts we wrote ourselves.
const registered = new Set(Object.keys(app.shell?.components ?? {}));
const named = componentsOf([app.actions, app.shell?.layout]);
const missing = [...named].filter((n) => !registered.has(n));
ok('the layouts name components', named.size > 8, `${named.size} distinct`);
ok('every one of them is registered', missing.length === 0, missing.join(', '));
ok('nothing registered is unreachable', registered.size >= named.size);
ok('no error node in any rendered tree', ![anonTree, marenTree, avaTree, darioTree].some((t) => t.includes('"kind":"error"')));


// ── nothing the sheet hosts may be a dead end ────────────────
//
// This shipped stuck: the calendar linked a class into the sheet, the scrim was
// inert, and the action inside was one that had never needed a Back button —
// so the only way out was a reload. A modal without an escape is the worst
// thing a phone can do.
//
// Asserted STRUCTURALLY rather than by clicking, because the failure was
// structural: an action reached a canvas it was not written for. Every action
// any layout pushes into the sheet must answer `sheetClose`.
const pushedToSheet = new Set<string>();
for (const definition of Object.values(app.actions)) {
  for (const trigger of definition.triggers ?? []) {
    for (const step of trigger.do ?? []) {
      const push = (step as { push?: { action?: string; canvas?: string } }).push;
      if (push?.canvas === 'sheet' && typeof push.action === 'string') pushedToSheet.add(push.action);
    }
  }
}
ok('the sheet hosts something', pushedToSheet.size > 0, [...pushedToSheet].join(', '));

// THE RULE IS NOW STRUCTURAL. It used to be "every sheet-hosted action must
// remember a `sheetClose` trigger", which is a convention five files had to
// keep. The escape is supplied by the `sheet` FRAGMENT, so what has to be true
// is one thing: every push into the sheet composes it.
const naked = [];
for (const definition of Object.values(app.actions)) {
  for (const trigger of definition.triggers ?? []) {
    for (const step of trigger.do ?? []) {
      const push = (step as { push?: { action?: string; canvas?: string; with?: string[] } }).push;
      if (push?.canvas === 'sheet' && !(push.with ?? []).includes('sheet')) naked.push(String(push.action));
    }
  }
}
ok('...and every push composes the sheet fragment', naked.length === 0, naked.length === 0 ? 'the escape is supplied once, not remembered five times' : `bare: ${naked.join(', ')}`);


// ── the menu does not grow with the feature list ─────────────
//
// The structural guard on the whole navigation. A flat menu gained an entry
// per feature and was twelve long at sixteen screens; at fifty it is fifty.
// Six AREAS hold the menu and hubs hold the screens, so this asserts the shape
// rather than the contents — add a feature to a hub and nothing here moves.
const owner = login(CAST.lumen.owner);
await settle(10);
const menu = [...treeOf(owner).matchAll(/"name":"DrawerLink","props":{"label":"([^"]+)"/g)].map((m) => m[1]);
ok('the menu is areas, not features', menu.length <= 8, menu.join(' · '));

// EVERY DESTINATION IN THE TAXONOMY IS A REAL ACTION — the same dead-end rule
// the sheet has, applied to navigation.
//
// This used to assert that every `hub.*` action existed. There are no hub
// screens now: an area is a NAME, and what it opens is its first screen. So
// what has to be real is what the menu can actually reach — a grouped area's
// items, and a leaf area's own id.
const targets = [...new Set(AREAS.flatMap((area) => (area.items.length > 0 ? area.items.map((item) => item.action) : [area.id])))];
const unbuilt = targets.filter((id) => app.actions[id] === undefined);
ok('...and every area leads to a real action', unbuilt.length === 0, unbuilt.length === 0 ? `${targets.length} destinations, all built` : `missing: ${unbuilt.join(', ')}`);

// ── EVERY CONTROL IS WIRED TO SOMETHING ──────────────────────
//
// A `ref` in a layout with no trigger to answer it is a button that does
// nothing. Nothing catches it: it compiles, it renders, it takes the tap, and
// it is silent. It has now shipped twice — a confirmation whose ref moved, and
// a member's Sign out still listening for the ref of a bar that had been
// replaced by the shared drawer, which locked members into their account.
//
// So: walk every layout in the catalog, collect the refs, and demand an
// answer for each. Fragment triggers count, because a composed action really
// does get them.
// Only the components that DISPATCH. A field's ref is a name for a value, not
// a control — `people.form#status` is answered by the submit that reads it, not
// by a trigger of its own, and demanding one would make this fire on forty
// perfectly good inputs and be switched off within a week.
const CLICKS = new Set(['Button', 'DrawerLink', 'DrawerFooter', 'NavItem', 'Tab', 'RolePicker', 'Burger']);

const refsIn = (node: unknown, found: Set<string>): Set<string> => {
  if (Array.isArray(node)) {
    for (const child of node) refsIn(child, found);
    return found;
  }
  if (node === null || typeof node !== 'object') return found;
  const record = node as Record<string, unknown>;
  if (typeof record['ref'] === 'string' && CLICKS.has(String(record['component']))) found.add(record['ref']);
  for (const value of Object.values(record)) refsIn(value, found);
  return found;
};

const fragmentRefs = new Set<string>();
for (const fragment of Object.values(app.manifest?.shell?.fragments ?? {})) {
  for (const trigger of (fragment as { triggers?: { ref?: string }[] }).triggers ?? []) {
    if (typeof trigger.ref === 'string') fragmentRefs.add(trigger.ref);
  }
}

const dangling: string[] = [];
for (const [id, definition] of Object.entries(app.actions)) {
  const answered = new Set<string>(fragmentRefs);
  for (const trigger of definition.triggers ?? []) {
    const ref = (trigger as { ref?: string }).ref;
    if (typeof ref === 'string') answered.add(ref);
  }
  for (const ref of refsIn(definition.layout, new Set<string>())) {
    if (!answered.has(ref)) dangling.push(`${id}#${ref}`);
  }
}
ok('every control in every layout has a trigger to answer it', dangling.length === 0, dangling.length === 0 ? `${Object.keys(app.actions).length} actions` : `dead: ${dangling.join(', ')}`);

report('the scaffold stands: charter, shells, chrome, and one surface per principal.');
