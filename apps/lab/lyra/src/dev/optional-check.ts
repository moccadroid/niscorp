// Run: pnpm --filter lyra exec tsx src/dev/optional-check.ts
//
// OPTIONAL CONDITIONS. A context key can now switch a condition ON rather than
// only fill a hole in one. Omit it and the condition is REMOVED before the
// query compiles — which is a different thing from matching everything, and
// the difference is what this check exists to hold down.
//
// The property that matters is the one an optional condition could plausibly
// break: absence must WIDEN a query and must never REACH further. A caller who
// sends nothing gets everything they were always allowed to see, and not one
// row more.
import type { Query } from '@niscorp/vex';
import { pruneOptional, presenceOf, lintMutation, resolve } from '@niscorp/vex';
import { ROLL_ORDERS } from '@lyra/app/vex/member.entries';
import { CAST } from '@lyra/db/seed';
import { asPrincipal, envelopeOf, ok, report, runtime } from './world';

const read = (fp: string, context: Record<string, unknown>, path = '/api/staff/vex'): Promise<unknown> =>
  asPrincipal(CAST.lumen.owner, path, { fingerprint: fp, context });

const rows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value as Record<string, unknown>[] : []);
const names = (value: unknown): string[] => rows(value).map((r) => String(r['person_name']));

// ── absent means the condition is not there ──
const everyone = await read('staff/list', {});
const searched = await read('staff/list', { q: '%ines%' });

ok('omitting an optional key is not an error', Array.isArray(everyone), JSON.stringify(everyone).slice(0, 90));
ok('...and answers wider than the search does', names(everyone).length > names(searched).length, `${names(everyone).length} vs ${names(searched).length}`);
ok('...while the search still narrows', names(searched).length > 0 && names(searched).every((n) => n.toLowerCase().includes('ines')), names(searched).join(', '));

// The whole point: no sentinel. Asking for everyone used to mean knowing to
// send '%', which is a wildcard a caller had to learn rather than a question
// they could ask.
ok('sending no key and sending the old wildcard agree', JSON.stringify(names(everyone)) === JSON.stringify(names(await read('staff/list', { q: '%' }))), names(everyone).join(', '));

// A prism cannot omit a key, so null is how it says absent — and a null bound
// into an ILIKE would have matched NOTHING, which is the opposite answer.
ok('null reads as absent, not as a value that matches nothing', JSON.stringify(names(await read('staff/list', { q: null }))) === JSON.stringify(names(everyone)), 'an empty search box is not a search');

// ── DIRECTION FOLLOWS POSITION ──
//
// "Absence widens" is true under `and` and FALSE under `or`, and stating it
// loosely would be a claim somebody later relies on. An absent key reads as if
// the condition had never been written — so under `and` that removes a
// narrowing and the answer grows, while under `or` it removes an alternative
// and the answer shrinks. Both are correct; only the direction differs, and it
// is the author's placement that decides it.
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

// ── absence never REACHES ──
//
// The load-bearing one, and the one that holds whichever way direction went.
// Scope is injected after optional conditions are resolved, so a query stripped
// back to nothing is still this studio's own.
const nrOwner = (fp: string, context: Record<string, unknown>): Promise<unknown> =>
  asPrincipal(CAST.northrock.owner, `/api/staff/vex`, { fingerprint: fp, context });

const lumenAll = names(everyone);
const rockAll = names(await nrOwner('staff/list', {}));
ok('the widest possible read is still one tenant’s', lumenAll.length > 0 && rockAll.length > 0 && !lumenAll.some((n) => rockAll.includes(n)), `${lumenAll.length} vs ${rockAll.length}, no overlap`);

const dbTotal = Number((await runtime.db.query<{ n: number }>("SELECT count(*) n FROM staff WHERE studio_id = 'st_lumen' AND role <> 'automation'")).rows[0]?.n ?? -1);
ok('...and matches the table exactly, not more', lumenAll.length === dbTotal, `${lumenAll.length} of ${dbTotal}`);

// The non-optional conditions of the same entry still hold with everything
// else stripped away — dropping one condition must not drop its neighbours.
ok('a condition that is not optional survives absence', !JSON.stringify(everyone).includes('automation'), 'the automation principal is still excluded');

// ── the contract says so, without a failed request ──
const envelope = await envelopeOf(CAST.lumen.owner, '/api/staff/vex', { fingerprint: 'staff/list', context: {} });
const contract = ((envelope['meta'] as { context?: Record<string, { optional?: boolean; absent?: boolean }> } | undefined)?.context) ?? {};
ok('the contract publishes the optional key even when unsent', contract['q']?.optional === true, JSON.stringify(contract));
ok('...and says it was not supplied this run', contract['q']?.absent === true, 'a caller can discover the shape without failing first');

// ═══════════════════════════════════════════════════════════════
// THE ROLL — four questions, one fingerprint.
//
// `people/list` used to need three sentinels to answer "everyone": a lens
// name, a '%' wildcard and an empty cursor. It now answers an EMPTY CONTEXT,
// and each key added narrows it. This is the shape the whole exercise was for.
// ═══════════════════════════════════════════════════════════════

const roll = (context: Record<string, unknown>): Promise<unknown> =>
  asPrincipal(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/list', context });

const rollNames = async (context: Record<string, unknown>): Promise<string[]> =>
  rows(await roll(context)).map((r) => String(r['person_name']));

const wholeRoll = await rollNames({});
ok('the roll answers an empty context', wholeRoll.length > 0, `${wholeRoll.length} people, no lens, no search, no cursor`);

const lensed = await rollNames({ lens: 'members' });
ok('...a lens narrows it', lensed.length > 0 && lensed.length < wholeRoll.length, `${lensed.length} members of ${wholeRoll.length}`);

const lensedAndSearched = await rollNames({ lens: 'members', q: '%ava%' });
ok('...and a search narrows that again', lensedAndSearched.length > 0 && lensedAndSearched.length < lensed.length, lensedAndSearched.join(', '));

ok('an invented lens still selects nobody', (await rollNames({ lens: 'everyone-and-north-rock' })).length === 0, 'a lens is chosen from the arms, never written');

// The count read takes the same two questions, so the number under the list
// is the length of the list — a count that ignored the lens would be worse
// than no count.
const countOf = async (context: Record<string, unknown>): Promise<number> => {
  const value = await asPrincipal(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/count', context });
  return Number((value as { total?: number } | null)?.total ?? -1);
};
ok('the count agrees with the unfiltered roll', (await countOf({})) === wholeRoll.length, `${await countOf({})} vs ${wholeRoll.length}`);
ok('...and with the lensed one', (await countOf({ lens: 'members' })) === lensed.length, `${await countOf({ lens: 'members' })} vs ${lensed.length}`);

// ── sorting the roll, which the seek used to forbid ──
//
// `applySortContext` used to REPLACE the sort, so asking for name order threw
// away the `person_id` tiebreaker that makes the page key total. It now leads
// with the caller's column and keeps the rest behind it.
const byNameDesc = await rollNames({ sortBy: 'people.name', sortDir: 'desc' });
ok('the roll sorts by a named column', byNameDesc.length > 0 && byNameDesc[0] !== wholeRoll[0], `${String(wholeRoll[0])} → ${String(byNameDesc[0])}`);
ok('...reversing the default order exactly', JSON.stringify(byNameDesc) === JSON.stringify([...wholeRoll].reverse()), 'same rows, opposite order — nothing skipped by a lost tiebreaker');

const byJoined = await rollNames({ sortBy: 'studio_people.first_seen_on', sortDir: 'asc' });
ok('...and by a column it merely displays', byJoined.length === wholeRoll.length, `${byJoined.length} of ${wholeRoll.length}, none lost`);

// Standing is computed per row, so it is not orderable — and the refusal is
// the schema's, not a list somebody maintains.
const badSort = await roll({ sortBy: 'studio_people.standing' });
ok('sorting by the computed standing is refused', !Array.isArray(badSort), JSON.stringify(badSort).slice(0, 60));

// ── AND THE CURSOR FOLLOWS THE ORDER ─────────────────────────
//
// A seek is a position in ONE ordering. The roll used to hold a name-shaped
// cursor and offer four orders, so sorting by anything else had to give up
// paging — one page, no "show more", stated in the UI as a limit.
//
// The orders are declared once now (ROLL_ORDERS) and the seek carries an arm
// per order, so page two continues in whatever order page one was in. Walked
// here in EVERY declared order, because the way this breaks is silent: a
// cursor measuring the wrong axis does not error, it skips people.
const pageIn = async (order: { id: string; field: string; dir: string; rowKey: string; cursor: string }): Promise<string[]> => {
  const seen: string[] = [];
  let after: string | null = null;
  let afterId: string | null = null;
  for (let page = 0; page < 6; page += 1) {
    const rows_ = rows(await roll({
      lens: 'everyone',
      sortBy: order.field,
      sortDir: order.dir,
      // Only THIS order's cursor key — the others stay unsent, which is what
      // drops their arms and keeps a name out of a date comparison.
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

// Seeded past the page size, because walking thirteen people through a limit
// of fifty never reaches page two and would assert nothing at all. The dates
// vary so the first-seen orders have something to order BY — seeding them all
// on one day would make that column a single tie and the walk would prove only
// that the tiebreaker works.
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

// ── half a cursor is not half a page ──
//
// The seek reads TWO keys, so it is gated on both. Gated on one, sending
// `after` without `afterId` left a hole in a surviving clause: empty result,
// `missingContext: ["afterId"]`, and on a paging loop that reads as the end of
// the roll — people silently lost. Now an incomplete cursor drops the whole
// condition and answers the first page, which is wrong in a way a caller can
// see rather than wrong in a way they cannot.
// Compared against a roll read at THIS moment, not one from earlier in the
// file — the paging section above seeds sixty more people, so a baseline taken
// before it would be measuring two different rolls.
const pageNow = rows(await roll({})).length;
const halfCursor = await roll({ afterNameAsc: 'Ava Klein' });
ok('half a cursor drops the seek rather than emptying the page', rows(halfCursor).length === pageNow, `${rows(halfCursor).length} of ${pageNow}`);
const halfEnvelope = await envelopeOf(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/list', context: { afterNameAsc: 'Ava Klein' } });
ok('...and reports nothing missing, because nothing is', (halfEnvelope['meta'] as { missingContext?: string[] } | undefined)?.missingContext === undefined, 'a gate naming both keys cannot leave one of them required');

// The DSL's JSON-Schema conversion used to be asserted here, which was the
// wrong address: it is vex's contract, not Lyra's, and an app that happens to
// import vex is a poor place to notice vex breaking. It lives in
// `packages/vex/test/schemas/json-schema.test.ts` now, beside the schema it
// guards — see that file for what escaped and how.

// ── READS ONLY, and the refusals that hold that ──
//
// A write whose bounds depend on what the caller chose to send is the unkeyed
// UPDATE the authoring lint has always existed to refuse, reached by omission
// rather than by authoring. Asserted rather than assumed: this was claimed done
// once before it had a test.
const lintIssues = lintMutation({
  op: 'update',
  table: 'people',
  set: { name: { $context: 'name' } },
  where: { optional: { key: 'personId', then: { eq: ['people.id', { $context: 'personId' }] } } },
});
ok('a mutation carrying an optional condition fails the seed lint', lintIssues.length > 0, lintIssues.join(' · '));

// The three walkers that must never meet the node. Optional conditions are
// resolved before the pipeline, so this is unreachable in normal use — which is
// exactly why it is worth proving it throws. `scope/discover.ts` used to fall
// THROUGH on an unrecognised node, contributing no entities and therefore no
// tenant filter; a silent hole is a worse failure than a loud one.
let refused = false;
try {
  resolve({ from: ['staff'], fields: ['staff.id'], filter: { optional: { key: 'q', then: { eq: ['staff.role', 'desk'] } } } } as Query, {} as never);
} catch { refused = true; }
ok('an unpruned optional cannot reach the resolver', refused, 'reaching it would mean compiling without knowing what the caller sent');

report('an optional condition is absent, not permissive: omitting it reads as if the condition were never written, in whichever direction its position implies — and never reaches past what the caller could always see.');
