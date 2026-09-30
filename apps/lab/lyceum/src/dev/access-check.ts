// ACCESS CHECK — what a person CANNOT do, over the same HTTP surface a phone's
// devtools reach: their own session token against moss's /api/vex, replaying
// any fingerprint the app serves.
//
// A write outside a person's reach is not refused: it is a statement that
// matches no row, answered 200 with nothing in it. So every assertion here
// reads the database — the row a request aimed at is unchanged — rather than
// a status. And the fix must not reach too far: the write that is SUPPOSED to
// reach everybody (the registry's cards) still does.
import { mintSession } from '@niscorp/moss';
import { memberIssue, memberJoin } from '@lyceum/app/vex/member.entries';
import { boot } from '@lyceum/server/boot';
import { check, finish } from './harness';

type Row = { name: string; title: string | null };

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();

  const tokenOf = (principal: string): Promise<string> => mintSession(runtime.pool, principal, 60_000);
  const replay = async (token: string, fingerprint: string, context: Record<string, unknown>): Promise<number> =>
    (
      await server.request('/api/vex', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ fingerprint, context }),
      })
    ).status;
  const row = async (memberId: string): Promise<Row | undefined> =>
    (await runtime.db.query<Row>('SELECT name, title FROM members WHERE member_id = $1', [memberId])).rows[0];

  // Two people join, as themselves.
  const one = await tokenOf('m_one');
  const other = await tokenOf('m_other');
  await replay(one, memberJoin.fingerprint, { name: 'One' });
  await replay(other, memberJoin.fingerprint, { name: 'Other' });

  // ── a member cannot write an ID card — somebody else's, or their own ──
  const forged = await replay(one, memberIssue.fingerprint, { memberId: 'm_other', name: 'Forged', title: 'Forged', quirk: 'Forged' });
  const issued = await row('m_other');
  check(`a member cannot write somebody else's ID card — the projector shows it (${forged})`, forged >= 400 && issued?.name === 'Other' && issued.title === null);
  const refused = await replay(other, memberIssue.fingerprint, { memberId: 'm_other', name: 'Self', title: 'Self', quirk: 'Self' });
  check(`…nor their own: only the registry writes cards (${refused})`, refused >= 400 && (await row('m_other'))?.name === 'Other');

  // ── the fix does not reach too far: the registry still reaches everybody ──
  await replay(await tokenOf('registry'), memberIssue.fingerprint, { memberId: 'm_other', name: 'Issued', title: 'Clerk', quirk: 'On file.' });
  check('the registry still writes anybody\'s ID card', (await row('m_other'))?.name === 'Issued');

  await close();
  finish();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
