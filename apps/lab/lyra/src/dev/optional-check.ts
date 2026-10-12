import type { Query } from '@niscorp/vex';
import { pruneOptional, presenceOf, lintMutation, resolve } from '@niscorp/vex';
import { ROLL_ORDERS } from '@lyra/app/vex/member.entries';
import { CAST } from '@lyra/db/seed';
import { asPrincipal, envelopeOf, ok, report, runtime } from './world';

const read = (fp: string, context: Record<string, unknown>, path = '/api/staff/vex'): Promise<unknown> =>
  asPrincipal(CAST.lumen.owner, path, { fingerprint: fp, context });

const rows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value as Record<string, unknown>[] : []);
const names = (value: unknown): string[] => rows(value).map((r) => String(r['person_name']));

const everyone = await read('staff/list', {});
const searched = await read('staff/list', { q: '%ines%' });

ok('omitting an optional key is not an error', Array.isArray(everyone), JSON.stringify(everyone).slice(0, 90));
ok('...and answers wider than the search does', names(everyone).length > names(searched).length, `${names(everyone).length} vs ${names(searched).length}`);
ok('...while the search still narrows', names(searched).length > 0 && names(searched).every((n) => n.toLowerCase().includes('ines')), names(searched).join(', '));

ok('sending no key and sending the old wildcard agree', JSON.stringify(names(everyone)) === JSON.stringify(names(await read('staff/list', { q: '%' }))), names(everyone).join(', '));

ok('null reads as absent, not as a value that matches nothing', JSON.stringify(names(await read('staff/list', { q: null }))) === JSON.stringify(names(everyone)), 'an empty search box is not a search');

const AND_SHAPE: Query = {
  from: ['staff'],
  fields: ['staff.id'],
  filter: { and: [{ eq: ['staff.active', true] }, { optional: { key: 'q', then: { eq: ['staff.role', 'desk'] } } }] },
};
const OR_SHAPE: Query = {
  from: ['staff'],
  fields: ['staff.id'],
  filter: { or: [{ eq: ['staff.active', true] }, { optional: { key: 'q', then: { eq: ['staff.role', 'desk'] } } }] },
};
const withoutKey = presenceOf({});
ok('under `and`, an absent key leaves the narrowing behind', JSON.stringify(pruneOptional(AND_SHAPE, withoutKey).filter) === JSON.stringify({ eq: ['staff.active', true] }), 'one arm left, so the `and` collapses to it');
ok('under `or`, the same absence removes an alternative instead', JSON.stringify(pruneOptional(OR_SHAPE, withoutKey).filter) === JSON.stringify({ eq: ['staff.active', true] }), 'same residue, opposite meaning — the `or` got narrower, not wider');

const nrOwner = (fp: string, context: Record<string, unknown>): Promise<unknown> =>
  asPrincipal(CAST.northrock.owner, `/api/staff/vex`, { fingerprint: fp, context });

const lumenAll = names(everyone);
const rockAll = names(await nrOwner('staff/list', {}));
ok('the widest possible read is still one tenant’s', lumenAll.length > 0 && rockAll.length > 0 && !lumenAll.some((n) => rockAll.includes(n)), `${lumenAll.length} vs ${rockAll.length}, no overlap`);

const dbTotal = Number((await runtime.db.query<{ n: number }>("SELECT count(*) n FROM staff WHERE studio_id = 'st_lumen' AND role <> 'automation'")).rows[0]?.n ?? -1);
ok('...and matches the table exactly, not more', lumenAll.length === dbTotal, `${lumenAll.length} of ${dbTotal}`);

ok('a condition that is not optional survives absence', !JSON.stringify(everyone).includes('automation'), 'the automation principal is still excluded');

const envelope = await envelopeOf(CAST.lumen.owner, '/api/staff/vex', { fingerprint: 'staff/list', context: {} });
const contract = ((envelope['meta'] as { context?: Record<string, { optional?: boolean; absent?: boolean }> } | undefined)?.context) ?? {};
ok('the contract publishes the optional key even when unsent', contract['q']?.optional === true, JSON.stringify(contract));
ok('...and says it was not supplied this run', contract['q']?.absent === true, 'a caller can discover the shape without failing first');

const roll = (context: Record<string, unknown>): Promise<unknown> =>
  asPrincipal(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/list', context });

const rollNames = async (context: Record<string, unknown>): Promise<string[]> =>
  rows(await roll(context)).map((r) => String(r['person_name']));

const wholeRoll = await rollNames({});
ok('the roll answers an empty context', wholeRoll.length > 0, `${wholeRoll.length} people, no lens, no search, no cursor`);

const lensed = await rollNames({ holding: 'membership' });
ok('...a lens narrows it', lensed.length > 0 && lensed.length < wholeRoll.length, `${lensed.length} members of ${wholeRoll.length}`);

const lensedAndSearched = await rollNames({ holding: 'membership', q: '%ava%' });
ok('...and a search narrows that again', lensedAndSearched.length > 0 && lensedAndSearched.length < lensed.length, lensedAndSearched.join(', '));

ok('an invented lens still selects nobody', (await rollNames({ lens: 'everyone-and-north-rock' })).length === 0, 'a lens is chosen from the arms, never written');

const countOf = async (context: Record<string, unknown>): Promise<number> => {
  const value = await asPrincipal(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/count', context });
  return Number((value as { total?: number } | null)?.total ?? -1);
};
ok('the count agrees with the unfiltered roll', (await countOf({})) === wholeRoll.length, `${await countOf({})} vs ${wholeRoll.length}`);
ok('...and with the lensed one', (await countOf({ holding: 'membership' })) === lensed.length, `${await countOf({ holding: 'membership' })} vs ${lensed.length}`);

const byNameDesc = await rollNames({ sortBy: 'people.name', sortDir: 'desc' });
ok('the roll sorts by a named column', byNameDesc.length > 0 && byNameDesc[0] !== wholeRoll[0], `${String(wholeRoll[0])} → ${String(byNameDesc[0])}`);
ok('...reversing the default order exactly', JSON.stringify(byNameDesc) === JSON.stringify([...wholeRoll].reverse()), 'same rows, opposite order — nothing skipped by a lost tiebreaker');

const byJoined = await rollNames({ sortBy: 'studio_people.first_seen_on', sortDir: 'asc' });
ok('...and by a column it merely displays', byJoined.length === wholeRoll.length, `${byJoined.length} of ${wholeRoll.length}, none lost`);

const badSort = await roll({ sortBy: 'studio_people.standing' });
ok('sorting by the computed standing is refused', !Array.isArray(badSort), JSON.stringify(badSort).slice(0, 60));

const pageIn = async (order: { id: string; field: string; dir: string; rowKey: string; cursor: string }): Promise<string[]> => {
  const seen: string[] = [];
  let after: string | null = null;
  let afterId: string | null = null;
  for (let page = 0; page < 6; page += 1) {
    const rows_ = rows(await roll({
      lens: 'everyone',
      sortBy: order.field,
      sortDir: order.dir,
      [order.cursor]: after,
      afterId,
    }));
    if (rows_.length === 0) break;
    for (const r of rows_) seen.push(String(r['person_id']));
    const last = rows_[rows_.length - 1] as Record<string, unknown>;
    after = String(last[order.rowKey] ?? '');
    afterId = String(last['person_id'] ?? '');
    if (rows_.length < 50) break;
  }
  return seen;
};

// The dates vary so the first-seen orders are not a single tie.
for (let i = 0; i < 60; i += 1) {
  const id = `p_ord_${String(i).padStart(3, '0')}`;
  await runtime.db.query('INSERT INTO people (id, email, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, `${id}@example.com`, `Zy Order ${String(i).padStart(3, '0')}`]);
  await runtime.db.query(
    "INSERT INTO studio_people (id, studio_id, person_id, source, first_seen_on) VALUES ($1, 'st_lumen', $2, 'walk-in', studio_today('st_lumen') - $3::int) ON CONFLICT DO NOTHING",
    [`sp_ord_${i}`, id, i % 17],
  );
}

const everyoneCount = await countOf({});
ok('there are more people than one page holds', everyoneCount > 50, `${everyoneCount} on the roll, ${50} to a page`);

for (const order of ROLL_ORDERS) {
  const walked = await pageIn(order);
  const unique = new Set(walked);
  ok(
    `paging walks the whole roll in ${order.id}`,
    walked.length === everyoneCount && unique.size === everyoneCount,
    `${walked.length} rows, ${unique.size} distinct, of ${everyoneCount}`,
  );
}

// Read now, not reused from above: the paging section seeded sixty more people.
const pageNow = rows(await roll({})).length;
const halfCursor = await roll({ afterNameAsc: 'Ava Klein' });
ok('half a cursor drops the seek rather than emptying the page', rows(halfCursor).length === pageNow, `${rows(halfCursor).length} of ${pageNow}`);
const halfEnvelope = await envelopeOf(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/list', context: { afterNameAsc: 'Ava Klein' } });
ok('...and reports nothing missing, because nothing is', (halfEnvelope['meta'] as { missingContext?: string[] } | undefined)?.missingContext === undefined, 'a gate naming both keys cannot leave one of them required');

const lintIssues = lintMutation({
  op: 'update',
  table: 'people',
  set: { name: { $context: 'name' } },
  where: { optional: { key: 'personId', then: { eq: ['people.id', { $context: 'personId' }] } } },
});
ok('a mutation carrying an optional condition fails the seed lint', lintIssues.length > 0, lintIssues.join(' · '));

let refused = false;
try {
  resolve({ from: ['staff'], fields: ['staff.id'], filter: { optional: { key: 'q', then: { eq: ['staff.role', 'desk'] } } } } as Query, {} as never);
} catch { refused = true; }
ok('an unpruned optional cannot reach the resolver', refused, 'reaching it would mean compiling without knowing what the caller sent');

report('an optional condition is absent, not permissive: omitting it reads as if the condition were never written, in whichever direction its position implies — and never reaches past what the caller could always see.');
