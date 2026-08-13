import { CAST } from '@lyra/db/seed';
import { envelopeOf, runtime } from './world';

for (let i = 0; i < 60; i += 1) {
  const id = `p_ord_${String(i).padStart(3, '0')}`;
  await runtime.db.query('INSERT INTO people (id, email, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, `${id}@example.com`, `Zy Order ${String(i).padStart(3, '0')}`]);
  await runtime.db.query(
    "INSERT INTO studio_people (id, studio_id, person_id, source, first_seen_on) VALUES ($1, 'st_lumen', $2, 'walk-in', studio_today('st_lumen') - $3::int) ON CONFLICT DO NOTHING",
    [`sp_ord_${i}`, id, i % 17],
  );
}

const call = async (ctx: Record<string, unknown>): Promise<Record<string, unknown>> =>
  envelopeOf(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/list', context: ctx });

const base = { lens: 'everyone', sortBy: 'people.name', sortDir: 'asc', order: 'name-asc' };
const p1 = await call(base);
const rows1 = (p1['result'] ?? []) as Record<string, unknown>[];
const last = rows1[rows1.length - 1] as Record<string, unknown>;
console.log('page1:', rows1.length, 'last name =', JSON.stringify(last['person_name']), 'id =', JSON.stringify(last['person_id']));

const p2 = await call({ ...base, after: String(last['person_name']), afterId: String(last['person_id']) });
console.log('page2 envelope:', JSON.stringify(p2).slice(0, 300));

process.exit(0);
