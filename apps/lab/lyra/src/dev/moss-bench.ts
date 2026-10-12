import type { Shell } from '@niscorp/nova';
import { CAST } from '@lyra/db/seed';
import { idFor, login, mintToken, runtime, server, settle } from './world';

const KB = 1024;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

// Mirrors what moss puts on the wire for one canvas (moss/src/shells/stream.ts).
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

const owner = await server.shells?.session(await mintToken(CAST.lumen.owner), idFor(CAST.lumen.owner));
await settle(20);
if (owner === undefined) throw new Error('bench: no shell');

console.log(`\n${bold('  Bytes on the wire')}`);
console.log(`  ${'initial frame (3 canvases)'.padEnd(34)} ${(allCanvases(owner.shell) / KB).toFixed(1).padStart(7)} KB`);
for (const canvas of CANVASES) {
  console.log(dim(`    ${canvas.padEnd(30)} ${(canvasBytes(owner.shell, canvas) / KB).toFixed(1).padStart(7)} KB`));
}

const NAV = ['people.list', 'plans.list', 'reports.overview', 'timetable.list', 'staff.list'];
console.log(`\n  ${dim('per navigation — what changed, so what is sent')}`);
let navTotal = 0;
let navMs = 0;
const settledAfter = async (shell: Shell, was: string): Promise<number> => {
  const started = performance.now();
  for (let i = 0; i < 400; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    const now = JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('main')));
    if (now !== was) {
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
  const sent = after.reduce((n, bytes, i) => (bytes === before[i] ? n : n + bytes), 0);
  navTotal += sent;
  console.log(`    ${destination.padEnd(30)} ${(sent / KB).toFixed(1).padStart(7)} KB  ${dim(`${elapsed.toFixed(0)} ms until the tree settled`)}`);
}
console.log(`  ${dim(`mean ${(navTotal / NAV.length / KB).toFixed(1)} KB and ${(navMs / NAV.length).toFixed(0)} ms per navigation`)}`);

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
await runtime.db.query(
  `INSERT INTO bookings (id, studio_id, session_id, person_id, status, booked_at)
   SELECT 'bk_bench_' || i || '_' || b.session_id, b.studio_id, b.session_id, 'p_bench_' || i, b.status, b.booked_at
   FROM bookings b, generate_series(1, $1) AS i
   WHERE b.person_id = (SELECT id FROM people WHERE email = $2)
   ON CONFLICT (id) DO NOTHING`,
  [BATCH, MODEL],
);

server.refresh();

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
  // Not `idFor`: the world's roster is a boot-time snapshot, taken before the cohort was planted.
  const session = await server.shells?.session(await mintToken(email), `p_bench_${i}`);
  if (session !== undefined) shells.push(session.shell);
}

// Polled, not slept: a shell boots empty and fills as its loads land, and a
// half-built shell weighs less than a real one.
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

const treeOf = (shell: Shell): number => JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('main'))).length;
const measured = shells.map(treeOf);
const median = [...measured].sort((a, b) => a - b)[Math.floor(measured.length / 2)] ?? 0;
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

const wornPhrases = Object.keys(owner.shell.getPhrases() ?? {}).length;
const mounted = (server.shells?.list() ?? []).find((live) => live.principal === idFor(CAST.lumen.owner));
const mountedActions = (mounted?.canvases ?? []).reduce((n, canvas) => n + canvas.actions.length, 0);
console.log(
  `  ${'what one is made of'.padEnd(34)} ${dim(`${String(Object.keys(server.actions()).length)} actions served · ${String(mountedActions)} mounted on ${String(mounted?.canvases.length ?? 0)} canvases · ${String(wornPhrases)} phrases worn`)}`,
);
if (wornPhrases > 0) {
  console.log(`  ${''.padEnd(34)} ${dim('the book is one object for the whole deployment, not per shell')}`);
}

console.log(`\n${bold('  What that projects to')} ${dim('(linear extrapolation from 250 — not measured at scale)')}`);
for (const n of [1_000, 10_000, 100_000]) {
  const mb = (perShell * n) / KB / KB;
  const shown = mb < 1024 ? `${mb.toFixed(0)} MB` : `${(mb / 1024).toFixed(1)} GB`;
  console.log(`  ${`${n.toLocaleString()} concurrent shells`.padEnd(34)} ${shown.padStart(9)} heap`);
}
console.log(`\n${bold('  Does one shell grow with use?')}`);
const walker = shells[0];
if (walker !== undefined) {
  const lap = async (): Promise<void> => {
    for (const destination of ['me.classes', 'me.bookings', 'me.membership']) {
      walker.dispatch({ type: 'ui:click', ref: 'nav', payload: destination });
      await settle(3);
    }
  };
  // Warm-up first: cold, the first ~100 navigations are V8 tiering up the hot
  // paths and the in-process database growing its own caches, none of it the shell's.
  for (let i = 0; i < 32; i += 1) await lap();
  await settle(20);
  const settled = heap();
  const LOOP = 40;
  for (let i = 0; i < LOOP; i += 1) await lap();
  await settle(20);
  const grown = heap();
  const perNav = (grown - settled) / (LOOP * 3);
  // 8 KB sits far above the warm residual (database and jit noise, 2–6 KB) and far
  // below real retention: a held instance or data store is tens of KB per navigation.
  const CEILING = 8 * KB;
  const growth = grown - settled;
  const ratio = growth / Math.max(1, perShell);
  const against = `${ratio.toFixed(1)}× one shell's own cost over ${LOOP * 3} navigations`;
  const verdict =
    growth < 0
      ? 'below the noise floor — GC reclaimed more than the loop allocated'
      : perNav <= CEILING
        ? `flat — ${(perNav / KB).toFixed(2)} KB per navigation, under the ${String(CEILING / KB)} KB ceiling; ${against}`
        : `GROWING — ${against}`;
  console.log(`  ${`${LOOP * 3} navigations on one shell`.padEnd(34)} ${(growth / KB).toFixed(0).padStart(7)} KB total`);
  console.log(`  ${'per navigation'.padEnd(34)} ${(perNav / KB).toFixed(2).padStart(7)} KB  ${dim(verdict)}`);
  console.log(`  ${'its tree after the loop'.padEnd(34)} ${(allCanvases(walker) / KB).toFixed(1).padStart(7)} KB`);

  if (perNav > CEILING) {
    console.error(`\n  \x1b[31m✗ per-navigation growth ${(perNav / KB).toFixed(2)} KB exceeds the ${String(CEILING / KB)} KB ceiling — something retains per navigation.\x1b[0m\n`);
    process.exit(1);
  }
}

console.log(`\n${bold('  Reclamation')}`);
console.log(`  ${'idle sweep default'.padEnd(34)} ${'30 min'.padStart(7)}     ${dim('moss DEFAULT_IDLE_MS, sweeps every 60s')}`);
console.log(dim(`\n  A shell is per PRINCIPAL, not per connection — two tabs share one.`));
console.log('');
process.exit(0);
