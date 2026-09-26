// TABLES CHECK — the Ministry's tables go through strata's ledger.
//
// The talk runs on a Postgres that outlives the process, and until the ledger it
// ran the DDL on every boot. So the check is the adoption the live database
// will go through: a database that ran the old DDL and holds rows is migrated
// once, keeps every row, and is recorded — and a second boot does nothing. The
// migration itself is history, so its checksum is pinned: an edit is caught here,
// not by the talk refusing to start.
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { checksumOf } from '@niscorp/strata';
import { migrate, readLedger } from '@niscorp/strata/postgres';
import { DDL, LYCEUM_SEQUENCE } from '@lyceum/db/schema';
import { check, finish } from './harness';

const TABLES = ['departments', 'members', 'slides', 'slide_notes', 'deck', 'grants', 'login_links'];

const tablesOf = async (pool: ReturnType<typeof createPglitePool>): Promise<string[]> =>
  (await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'strata_ledger' ORDER BY table_name`)).rows.map((r) => String(r['table_name']));

const main = async (): Promise<void> => {
  // ── HISTORY, PINNED. Red here: put migration 1 back and append a new one. ──
  const baseline = LYCEUM_SEQUENCE.migrations[0];
  check('lyceum.app/1 is one statement per table (a `;` inside a comment does not split one)', baseline?.steps.length === TABLES.length);
  check('lyceum.app/1 is unchanged', baseline !== undefined && (await checksumOf(baseline)) === '299dd26ee2db4e8288e2bda0361db75300d4ef34e6dee1fe6cce94701e0f4c61');

  // ── a fresh database ──
  const fresh = createPglitePool(new PGlite());
  await migrate(fresh, [LYCEUM_SEQUENCE]);
  check('a fresh database gets every table', JSON.stringify(await tablesOf(fresh)) === JSON.stringify([...TABLES].sort()));
  check('...and the ledger records lyceum.app/1', (await readLedger(fresh)).map((r) => `${r.sequence}/${r.n}`).join() === 'lyceum.app/1');
  check('a second boot runs nothing', (await migrate(fresh, [LYCEUM_SEQUENCE])).applied.length === 0);

  // ── the live talk's database: it ran the old DDL on every boot and holds rows ──
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(`INSERT INTO departments (department_id, name, remit, mark, sigil, position) VALUES ('archive', 'Archive', 'Reads', 'dots', 'circle', 1)`);
  await db.exec(`INSERT INTO members (member_id, name, department_id) VALUES ('m_1', 'Ada', 'archive')`);
  const live = createPglitePool(db);
  const report = await migrate(live, [LYCEUM_SEQUENCE]);
  check('a database from before the ledger adopts: migration 1 runs once and is recorded', report.applied.map((m) => m.ref).join() === 'lyceum.app/1');
  const members = (await live.query(`SELECT member_id, department_id FROM members`)).rows;
  check('...and keeps its rows', JSON.stringify(members) === JSON.stringify([{ member_id: 'm_1', department_id: 'archive' }]));

  finish();
};

await main();
