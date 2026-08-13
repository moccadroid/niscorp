// Moss bench — what a server-side shell costs.
//
// Moss keeps one durable shell per PRINCIPAL and streams rendered canvas trees
// over a socket. Two questions decide whether that scales: what a live shell
// costs in memory, and what an interaction costs in bytes and milliseconds.
// Both are measured here against real shells, not modelled.
//
// Run: pnpm --filter lyra exec tsx --expose-gc src/dev/moss-bench.ts
import type { Shell } from '@niscorp/nova';
import { CAST } from '@lyra/db/seed';
import { app, idFor, login, mintToken, runtime, server, settle } from './world';

const KB = 1024;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

// What moss actually puts on the wire for one canvas: the flattened tree,
// wrapped in a render message. Mirrors `frame()` in moss/src/shells.ts.
const canvasBytes = (shell: Shell, canvas: string): number => {
  const tree = shell.flattenRenderTree(shell.getCanvasRenderTree(canvas));
  return JSON.stringify({ type: 'render', canvas, tree }).length;
};
const CANVASES = ['chrome', 'main', 'sheet'];
const allCanvases = (shell: Shell): number => CANVASES.reduce((n, c) => n + canvasBytes(shell, c), 0);

const heap = (): number => {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc !== undefined) {
    gc();
    gc();
  }
  return process.memoryUsage().heapUsed;
};

console.log(`\n${bold('MOSS BENCH')} ${dim('— one durable shell per principal, full canvas trees over a socket')}`);
const gcOn = (globalThis as { gc?: () => void }).gc !== undefined;
if (!gcOn) console.log(dim('  (no --expose-gc: memory figures are noisier, treat as indicative)'));

// ─── 1. what one interaction puts on the wire ────────────────
const owner = await server.shells?.session(await mintToken(CAST.lumen.owner), idFor(CAST.lumen.owner));
await settle(20);
if (owner === undefined) throw new Error('bench: no shell');

console.log(`\n${bold('  Bytes on the wire')}`);
console.log(`  ${'initial frame (3 canvases)'.padEnd(34)} ${(allCanvases(owner.shell) / KB).toFixed(1).padStart(7)} KB`);
for (const canvas of CANVASES) {
  console.log(dim(`    ${canvas.padEnd(30)} ${(canvasBytes(owner.shell, canvas) / KB).toFixed(1).padStart(7)} KB`));
}

// A navigation changes `main`; the chrome only changes if the lit tab moves.
const NAV = ['people.list', 'plans.list', 'reports.overview', 'timetable.list', 'staff.list'];
console.log(`\n  ${dim('per navigation — what changed, so what is sent')}`);
let navTotal = 0;
let navMs = 0;
// Polled, not slept: a fixed `settle()` measures the timer, not the shell. This
// waits for the tree to actually stop moving, then reports how long that took.
const settledAfter = async (shell: Shell, was: string): Promise<number> => {
  const started = performance.now();
  for (let i = 0; i < 400; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    const now = JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('main')));
    if (now !== was) {
      // Changed — now wait for it to stop changing.
      let last = now;
      for (let j = 0; j < 100; j += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        const next = JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('main')));
        if (next === last) return performance.now() - started;
        last = next;
      }
      return performance.now() - started;
    }
  }
  return performance.now() - started;
};

for (const destination of NAV) {
  const before = CANVASES.map((c) => canvasBytes(owner.shell, c));
  const wasMain = JSON.stringify(owner.shell.flattenRenderTree(owner.shell.getCanvasRenderTree('main')));
  owner.shell.dispatch({ type: 'ui:click', ref: 'nav', payload: destination });
  const elapsed = await settledAfter(owner.shell, wasMain);
  navMs += elapsed;
  const after = CANVASES.map((c) => canvasBytes(owner.shell, c));
  // Moss skips a canvas whose serialised tree is unchanged, so only differing
  // canvases cost bandwidth — but a differing one costs its WHOLE tree.
  const sent = after.reduce((n, bytes, i) => (bytes === before[i] ? n : n + bytes), 0);
  navTotal += sent;
  console.log(`    ${destination.padEnd(30)} ${(sent / KB).toFixed(1).padStart(7)} KB  ${dim(`${elapsed.toFixed(0)} ms until the tree settled`)}`);
}
console.log(`  ${dim(`mean ${(navTotal / NAV.length / KB).toFixed(1)} KB and ${(navMs / NAV.length).toFixed(0)} ms per navigation`)}`);

// ─── 2. what a shell costs to keep alive ─────────────────────
//
// Real principals, because a synthetic id resolves to an empty catalog and an
// empty shell would flatter the number by an order of magnitude.
//
// Each one is built by COPYING a member the seed already knows, rather than by
// hand-authoring what a member is made of. That is the whole trick here: the
// shape of "a member" is a moving target this app is free to redefine — it
// already split `memberships` into an anchor and its entitlements, and the
// hand-authored version of this block broke on it — but "whatever Ava has,
// with a different person_id" cannot drift out of date. If her rows move, this
// moves with them or fails outright; it cannot quietly produce somebody who is
// technically a principal and renders an empty screen.
console.log(`\n${bold('  Memory per live shell')}`);
const BATCH = 250;
const MODEL = CAST.lumen.member;

await runtime.db.query(
  `INSERT INTO people (id, email, name)
   SELECT 'p_bench_' || i, 'bench' || i || '@lumen.studio', 'Bench ' || i
   FROM generate_series(1, $1) AS i
   ON CONFLICT (id) DO NOTHING`,
  [BATCH],
);
// The anchor, the entitlement, and the history — each one Ava's row wearing a
// bench person's id. `SELECT *`-shaped copies are deliberate: naming columns
// here would reintroduce exactly the coupling that broke last time.
await runtime.db.query(
  `INSERT INTO studio_people (id, studio_id, person_id, source, first_seen_on, trial_ends_on, notes)
   SELECT 'sp_bench_' || i, sp.studio_id, 'p_bench_' || i, sp.source, sp.first_seen_on, sp.trial_ends_on, sp.notes
   FROM studio_people sp, generate_series(1, $1) AS i
   WHERE sp.person_id = (SELECT id FROM people WHERE email = $2)
   ON CONFLICT (id) DO NOTHING`,
  [BATCH, MODEL],
);
await runtime.db.query(
  `INSERT INTO subscriptions (id, studio_id, person_id, offering_id, status, paid_via, started_on, ends_on, price_cents)
   SELECT 'sub_bench_' || i, s.studio_id, 'p_bench_' || i, s.offering_id, s.status, s.paid_via, s.started_on, s.ends_on, s.price_cents
   FROM subscriptions s, generate_series(1, $1) AS i
   WHERE s.person_id = (SELECT id FROM people WHERE email = $2)
   ON CONFLICT (id) DO NOTHING`,
  [BATCH, MODEL],
);
// Bookings are what a member's own screen is mostly MADE of — without them the
// shells build fine and measure a third of what they should.
await runtime.db.query(
  `INSERT INTO bookings (id, studio_id, session_id, person_id, status, booked_at)
   SELECT 'bk_bench_' || i || '_' || b.session_id, b.studio_id, b.session_id, 'p_bench_' || i, b.status, b.booked_at
   FROM bookings b, generate_series(1, $1) AS i
   WHERE b.person_id = (SELECT id FROM people WHERE email = $2)
   ON CONFLICT (id) DO NOTHING`,
  [BATCH, MODEL],
);

// ROWS ARE NOT PRINCIPALS. `app.assignments` is a snapshot taken at boot from
// the directory, so somebody who arrives after it is a person the app knows
// and a principal it does not — their shell resolves to the anonymous catalog
// and serves the SIGN-IN screen. That is what the first attempt at this block
// actually measured: 250 login screens, reported as members.
//
// In production the staff screen's `world.refresh` re-derives the snapshot.
// There is no HTTP surface for it (the function seam is in-process, per shell
// session), so the bench does what app.ts already does for an integration
// actor that appears mid-process — splices the person in using the app's OWN
// `rolesOf`, rather than a second spelling of what a role is.
// No assignment map to seed any more: roles are resolved per principal.
server.refresh();

// The rows are there before anything is built on them. A failed copy above is
// not a smaller number, it is a different measurement wearing this one's label.
const planted = await runtime.pool.query(
  `SELECT (SELECT count(*) FROM people WHERE id LIKE 'p_bench_%') AS people,
          (SELECT count(*) FROM studio_people WHERE person_id LIKE 'p_bench_%') AS anchors,
          (SELECT count(*) FROM subscriptions WHERE person_id LIKE 'p_bench_%') AS subs,
          (SELECT count(*) FROM bookings WHERE person_id LIKE 'p_bench_%') AS bookings`,
);
const rows = planted.rows[0] as Record<string, string>;
if (Number(rows['people']) < BATCH || Number(rows['anchors']) < BATCH || Number(rows['subs']) < BATCH || Number(rows['bookings']) < BATCH) {
  console.error(`\n  ✗ the bench cohort did not plant — ${JSON.stringify(rows)} against ${BATCH} expected of each.\n`);
  process.exit(1);
}

const before = heap();
const shells: Shell[] = [];
const started = performance.now();
for (let i = 1; i <= BATCH; i += 1) {
  const email = `bench${i}@lumen.studio`;
  // Not `idFor` — the world's roster is a boot-time snapshot, taken before the
  // cohort above was planted. The id is the INSERT's own spelling.
  const session = await server.shells?.session(await mintToken(email), `p_bench_${i}`);
  if (session !== undefined) shells.push(session.shell);
}

// SETTLED, NOT SLEPT. A shell boots empty and fills as its loads land, so a
// fixed sleep measures whatever happened to have arrived by then — and 250
// shells loading at once do not finish in the time one does. Half-built shells
// weigh less than real ones, so sleeping here understates the very number this
// section exists to produce. Poll until the trees stop moving, and refuse to
// report if they never do.
const totalTree = (): number => shells.reduce((sum, shell) => sum + JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('main'))).length, 0);
const SETTLE_TIMEOUT_MS = 120_000;
let stable = 0;
let last = -1;
while (stable < 3) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const now = totalTree();
  stable = now === last ? stable + 1 : 0;
  last = now;
  if (performance.now() - started > SETTLE_TIMEOUT_MS) {
    console.error(`\n  ✗ ${BATCH} shells never stopped changing in ${SETTLE_TIMEOUT_MS / 1000}s — nothing below would be a measurement.\n`);
    process.exit(1);
  }
}
const buildMs = performance.now() - started;
const after = heap();

// THE BENCH MUST NOT REPORT A NUMBER IT CANNOT STAND BEHIND.
//
// Everything above depends on schema this app is free to change — and it did:
// `memberships` was split into the anchor and its entitlements, and this file
// went on asking for a table that no longer existed. That failure was loud,
// which was luck. The quiet version is worse and just as reachable: seed rows
// that no longer make somebody a MEMBER still insert fine, the shells still
// build, and the bench prints a confident per-shell figure measured on 250
// empty screens. Somebody then sizes a box on it.
//
// So the shells are inspected before the number is believed, and the thing
// they are held against is a SEEDED member — Ava, whose rows the app's own
// checks depend on. An anonymous shell is far too weak a bar: it is a lock
// screen, so nearly anything clears it. Ava is the actual claim — "these 250
// are the same kind of thing as a member the app already knows".
const treeOf = (shell: Shell): number => JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('main'))).length;
const measured = shells.map(treeOf);
const median = [...measured].sort((a, b) => a - b)[Math.floor(measured.length / 2)] ?? 0;
// Settled the same way, for the same reason: an unsettled reference renders
// almost nothing, and comparing against almost nothing passes anything. That
// is exactly how the first version of this guard let 250 half-built shells
// through calling them "a real member's screen".
const seeded = await login(CAST.lumen.member);
let refStable = 0;
let refLast = -1;
while (refStable < 3) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const now = treeOf(seeded);
  refStable = now === refLast ? refStable + 1 : 0;
  refLast = now;
}
const real = treeOf(seeded);
if (shells.length < BATCH || median < real * 0.8) {
  console.error(
    `\n  ✗ these are not live member shells — ${shells.length}/${BATCH} built, median tree ${median} chars` +
      ` against ${real} for ${CAST.lumen.member}, a member the seed already knows.` +
      '\n    The rows inserted above no longer make somebody a member. Fix that before trusting any number below.\n',
  );
  process.exit(1);
}

const perShell = (after - before) / Math.max(1, shells.length);
console.log(`  ${'live shells created'.padEnd(34)} ${String(shells.length).padStart(7)}  ${dim(`median tree ${(median / KB).toFixed(1)} KB, against ${(real / KB).toFixed(1)} KB for a seeded member`)}`);
console.log(`  ${'heap delta'.padEnd(34)} ${(((after - before) / KB / KB)).toFixed(1).padStart(7)} MB`);
console.log(`  ${'per shell'.padEnd(34)} ${(perShell / KB).toFixed(1).padStart(7)} KB`);
console.log(`  ${'build + settle'.padEnd(34)} ${buildMs.toFixed(0).padStart(7)} ms  ${dim(`${(buildMs / Math.max(1, shells.length)).toFixed(1)} ms each`)}`);

// ─── 3. extrapolation, stated as such ────────────────────────
console.log(`\n${bold('  What that projects to')} ${dim('(linear extrapolation from 250 — not measured at scale)')}`);
for (const n of [1_000, 10_000, 100_000]) {
  const mb = (perShell * n) / KB / KB;
  const shown = mb < 1024 ? `${mb.toFixed(0)} MB` : `${(mb / 1024).toFixed(1)} GB`;
  console.log(`  ${`${n.toLocaleString()} concurrent shells`.padEnd(34)} ${shown.padStart(9)} heap`);
}
// ─── 4. does one shell GROW as somebody uses it? ─────────────
//
// The figure that decides whether a long-lived shell is viable at all. Nav uses
// `resetTo`, which replaces a canvas top rather than stacking — but records and
// forms PUSH, so a session open all day could accumulate instances. Measured
// over a realistic loop rather than reasoned about.
console.log(`\n${bold('  Does one shell grow with use?')}`);
const walker = shells[0];
if (walker !== undefined) {
  const settled = heap();
  const LOOP = 40;
  for (let i = 0; i < LOOP; i += 1) {
    for (const destination of ['me.classes', 'me.bookings', 'me.membership']) {
      walker.dispatch({ type: 'ui:click', ref: 'nav', payload: destination });
      await settle(3);
    }
  }
  await settle(20);
  const grown = heap();
  const perNav = (grown - settled) / (LOOP * 3);
  // Judged against what a shell COSTS, not against a round number. "2 KB per
  // navigation" means nothing on its own; "the shell grew to four times its own
  // weight in 120 navigations" is the sentence that decides whether a session
  // open all day is viable, and it is the same number said usefully.
  //
  // A negative total is not "flat" either — it means GC reclaimed more than the
  // loop allocated between the two reads, so no growth was measurable. Saying
  // "flat" there would be reporting a measurement that wasn't made.
  const growth = grown - settled;
  const ratio = growth / Math.max(1, perShell);
  const verdict =
    growth < 0
      ? 'below the noise floor — GC reclaimed more than the loop allocated'
      : ratio < 1
        ? `flat — ${(ratio * 100).toFixed(0)}% of one shell over ${LOOP * 3} navigations`
        : `GROWING — ${ratio.toFixed(1)}× one shell's own cost over ${LOOP * 3} navigations`;
  console.log(`  ${`${LOOP * 3} navigations on one shell`.padEnd(34)} ${(growth / KB).toFixed(0).padStart(7)} KB total`);
  console.log(`  ${'per navigation'.padEnd(34)} ${(perNav / KB).toFixed(2).padStart(7)} KB  ${dim(verdict)}`);
  console.log(`  ${'its tree after the loop'.padEnd(34)} ${(allCanvases(walker) / KB).toFixed(1).padStart(7)} KB`);
}

console.log(`\n${bold('  Reclamation')}`);
console.log(`  ${'idle sweep default'.padEnd(34)} ${'30 min'.padStart(7)}     ${dim('moss DEFAULT_IDLE_MS, sweeps every 60s')}`);
console.log(dim(`\n  A shell is per PRINCIPAL, not per connection — two tabs share one.`));
console.log('');
process.exit(0);
