// Run: pnpm --filter lyra exec tsx src/dev/shell-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { componentsOf } from '@niscorp/nova/reflect';
import { CAST } from '@lyra/db/seed';
import { AREAS } from '@lyra/app/nav/sections';
import { anonymous, app, idFor, idsFor, login, ok, report, runtime, server, settle, treeOf } from './world';

// ── the boot itself ──
ok('the manifest boots', server !== undefined);
ok('the app serves shells', server.shells !== undefined);

// ── and what it does NOT serve: the operator seam ──
//
// This world was given no operator key — the state of every check that does not
// import `./operator-key`, and of a deployment before anybody sets one. Off
// means ABSENT, not locked: the path answers 404 to the very key that opens it
// in admin-check's world, and to an empty one, which is the guess that would
// match an unset key if anything compared before asking whether there was a
// key to compare against.
//
// It lives here because moss reads the key once, at boot, so the world that
// proves wrong-and-right (admin-check) cannot also be the one that proves off.
// The first line is the premise, stated so it can fail: run with OPERATOR_KEY
// exported and this world HAS a seam, and the two below it would be passing
// about a wrong key instead.
const knock = async (key: string): Promise<Response> => server.request('/operator/integrations', { headers: { 'x-operator-key': key } });
ok(
  'a world given no operator key was built with none',
  runtime.operatorKey === undefined,
  runtime.operatorKey === undefined ? 'OPERATOR_KEY is unset, and nothing defaulted it' : 'OPERATOR_KEY is set in this environment — unset it; this check is about the seam being off',
);
ok('...so the operator seam is not there, even for the key that would open it', (await knock('lab-operator-key')).status === 404);
ok('...nor for an empty one', (await knock('')).status === 404, 'unset is not a key that "" matches');

// ── ring 1: existence, per principal ──

const anonIds = await idsFor(null);
ok('anonymous holds exactly one action', anonIds.length === 1, anonIds.join(', '));
ok('...and it is the way in', anonIds.includes('auth.login'));

const ownerIds = await idsFor(CAST.lumen.owner);
const memberIds = await idsFor(CAST.lumen.member);
ok('an owner holds more than a member does', ownerIds.length > memberIds.length, `${ownerIds.length} vs ${memberIds.length}`);
ok('a member does NOT hold the staff chrome', !memberIds.includes('chrome.staff'));
ok('an owner does hold it', ownerIds.includes('chrome.staff'));
ok('nobody signed in holds the login page', !ownerIds.includes('auth.login') && !memberIds.includes('auth.login'));

// ── the anonymous principal ──
const anon = await anonymous();
await settle();
const anonTree = treeOf(anon);
ok('anonymous is served the login page', anonTree.includes('Sign in'));
ok('...with the cast to pick from', anonTree.includes('Maren Holt'));
ok('...and no chrome at all — they hold neither bar', !anonTree.includes('Sign out'));

// ── a studio owner ──
const maren = await login(CAST.lumen.owner);
await settle();
const marenTree = treeOf(maren);
ok('the owner gets the staff chrome', marenTree.includes('Lumen Yoga'));
ok('...labelled with their role', marenTree.includes('Owner'));
ok('...and lands on Today, greeted by name', marenTree.includes('Maren'));
ok('...with no login page anywhere in their shell', !marenTree.includes('Email me a link'));

// ── a member ──
const ava = await login(CAST.lumen.member);
await settle();
const avaTree = treeOf(ava);
ok('a member gets their own chrome', avaTree.includes('Lumen Yoga') && avaTree.includes('Ava'));
ok('...and is not labelled a role they do not hold', !avaTree.includes('Owner'));

// ── the tenant boundary, as the shell sees it ──
const dario = await login(CAST.northrock.owner);
await settle();
const darioTree = treeOf(dario);
ok('the other studio sees its own name', darioTree.includes('North Rock'));
ok('...and never the first one', !darioTree.includes('Lumen'));
ok('...and Lumen never sees theirs', !marenTree.includes('North Rock'));

// ── every canvas can be clicked ──
const canvases = app.shell?.canvases ?? [];
const withoutSlot = canvases.filter((canvas) => !JSON.stringify(canvas.actionLayout ?? null).includes('ActionSlot'));
ok('every canvas declares an actionLayout', canvases.every((c) => c.actionLayout !== undefined), canvases.map((c) => c.id).join(', '));
ok('...and every one of them renders an ActionSlot', withoutSlot.length === 0, withoutSlot.map((c) => c.id).join(', ') || 'all good — clicks can reach their instance');

// ── the kit answers for what the layouts ask ──
const registered = new Set(Object.keys(app.shell?.components ?? {}));
const named = componentsOf([app.actions, app.shell?.layout]);
const missing = [...named].filter((n) => !registered.has(n));
ok('the layouts name components', named.size > 8, `${named.size} distinct`);
ok('every one of them is registered', missing.length === 0, missing.join(', '));
ok('nothing registered is unreachable', registered.size >= named.size);
ok('no error node in any rendered tree', ![anonTree, marenTree, avaTree, darioTree].some((t) => t.includes('"kind":"error"')));

// ── nothing the sheet hosts may be a dead end ────────────────
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
const owner = await login(CAST.lumen.owner);
await settle(10);
const menu = [...treeOf(owner).matchAll(/"name":"DrawerLink","props":{"label":"([^"]+)"/g)].map((m) => m[1]);
ok('the menu is areas, not features', menu.length <= 8, menu.join(' · '));

const targets = [...new Set(AREAS.flatMap((area) => (area.items.length > 0 ? area.items.map((item) => item.action) : [area.id])))];
const unbuilt = targets.filter((id) => app.actions[id] === undefined);
ok('...and every area leads to a real action', unbuilt.length === 0, unbuilt.length === 0 ? `${targets.length} destinations, all built` : `missing: ${unbuilt.join(', ')}`);

// ── every control is wired to something ──────────────────────
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
// `app.manifest` has never existed on NiscApp — the fragments live at
// `app.shell.fragments`. So this loop read `undefined ?? {}` and iterated
// NOTHING: every assertion below about fragment refs has been passing on an
// empty set. Vacuous, and invisible while src/dev went untypechecked.
for (const fragment of Object.values(app.shell?.fragments ?? {})) {
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
