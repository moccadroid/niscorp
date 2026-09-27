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
import { TIDE_TABLES } from '@niscorp/moss';
import { DDL, LYCEUM_SEQUENCE, LYCEUM_SEQUENCES } from '@lyceum/db/schema';
import { check, finish } from './harness';

// What migration 1 creates, and what the whole sequence leaves.
const BASELINE_TABLES = ['departments', 'members', 'slides', 'slide_notes', 'deck', 'grants', 'login_links'];
const TABLES = [...BASELINE_TABLES, 'slide_tools', 'asks', 'timers'];
// What the boot migrates: lyceum's sequence and tide's (db/schema.ts).
const BOOT_TABLES = [...TABLES, ...TIDE_TABLES];
const ALL = LYCEUM_SEQUENCE.migrations.map((_, index) => `lyceum.app/${index + 1}`).join();

const tablesOf = async (pool: ReturnType<typeof createPglitePool>): Promise<string[]> =>
  (await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'strata_ledger' ORDER BY table_name`)).rows.map((r) => String(r['table_name']));

const main = async (): Promise<void> => {
  // ── HISTORY, PINNED. Red here: put migration 1 back and append a new one. ──
  const baseline = LYCEUM_SEQUENCE.migrations[0];
  check('lyceum.app/1 is one statement per table (a `;` inside a comment does not split one)', baseline?.steps.length === BASELINE_TABLES.length);
  check('lyceum.app/1 is unchanged', baseline !== undefined && (await checksumOf(baseline)) === '299dd26ee2db4e8288e2bda0361db75300d4ef34e6dee1fe6cce94701e0f4c61');
  const slideTools = LYCEUM_SEQUENCE.migrations[1];
  check('lyceum.app/2 is unchanged', slideTools !== undefined && (await checksumOf(slideTools)) === '8185a9c82a089b2e5ab1cfe7cf07e46d21cb9df464596a96d3cac5da55244aa4');
  const asks = LYCEUM_SEQUENCE.migrations[2];
  check('lyceum.app/3 is unchanged', asks !== undefined && (await checksumOf(asks)) === '2b23d46ac39621353aea5d577160255b282f606b097c2a29aed01c23b3668686');
  const timers = LYCEUM_SEQUENCE.migrations[3];
  check('lyceum.app/4 is unchanged', timers !== undefined && (await checksumOf(timers)) === 'cfff32da4f9923cee3258967f12b089f53aadd98eafd23974c1efa249ed49c6c');

  // ── a fresh database ──
  const fresh = createPglitePool(new PGlite());
  await migrate(fresh, [...LYCEUM_SEQUENCES]);
  check('a fresh database gets every table, lyceum and tide both, before the server looks', JSON.stringify(await tablesOf(fresh)) === JSON.stringify([...BOOT_TABLES].sort()));
  check(`...and the ledger records every one of lyceum's migrations (${ALL})`, (await readLedger(fresh)).filter((r) => r.sequence === 'lyceum.app').map((r) => `${r.sequence}/${r.n}`).join() === ALL);
  check('a second boot runs nothing', (await migrate(fresh, [...LYCEUM_SEQUENCES])).applied.length === 0);

  // ── the live talk's database: it ran the old DDL on every boot and holds rows ──
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(`INSERT INTO departments (department_id, name, remit, mark, sigil, position) VALUES ('archive', 'Archive', 'Reads', 'dots', 'circle', 1)`);
  await db.exec(`INSERT INTO members (member_id, name, department_id) VALUES ('m_1', 'Ada', 'archive')`);
  await db.exec(`INSERT INTO slides (slide_id, position, title, tool_id) VALUES ('s_1', 0, 'One', 'tools.assignment'), ('s_2', 1, 'Two', NULL)`);
  const live = createPglitePool(db);
  const report = await migrate(live, [LYCEUM_SEQUENCE]);
  check(`a database from before the ledger adopts: every migration runs once and is recorded (${ALL})`, report.applied.map((m) => m.ref).join() === ALL);
  const members = (await live.query(`SELECT member_id, department_id FROM members`)).rows;
  check('...and keeps its rows', JSON.stringify(members) === JSON.stringify([{ member_id: 'm_1', department_id: 'archive' }]));
  const tools = (await live.query(`SELECT slide_id, position, tool_id FROM slide_tools ORDER BY slide_id`)).rows;
  check('...and the tool a slide named is now its first tool row', JSON.stringify(tools) === JSON.stringify([{ slide_id: 's_1', position: 0, tool_id: 'tools.assignment' }]));
  check('a second boot of it runs nothing', (await migrate(live, [LYCEUM_SEQUENCE])).applied.length === 0);

  finish();
};

await main();
