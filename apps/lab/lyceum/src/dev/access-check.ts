// ACCESS CHECK — what a person CANNOT do, over the same HTTP surface a phone's
// devtools reach: their own session token against moss's /api/vex, replaying
// any fingerprint the app serves.
//
// A write outside a person's reach is not refused: it is a statement that
// matches no row, answered 200 with nothing in it. So every assertion here
// reads the database — the row a request aimed at is unchanged — rather than
// a status. And the fix must not reach too far: the writes that are SUPPOSED
// to reach the room (the speaker's assignment, the registry's cards) still do.
import { mintSession } from '@niscorp/moss';
import { memberAssign, memberIssue, memberJoin, memberRename, memberUnassign } from '@lyceum/app/vex/member.entries';
import { boot } from '@lyceum/server/boot';
import { check, finish } from './harness';

type Row = { name: string; title: string | null; department_id: string | null };

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
    (await runtime.db.query<Row>('SELECT name, title, department_id FROM members WHERE member_id = $1', [memberId])).rows[0];

  // Two people step in as themselves; one is placed in Forms the way
  // assignment places anybody — a row, then a new identity.
  const clerk = await tokenOf('m_clerk');
  const other = await tokenOf('m_other');
  await replay(clerk, memberJoin.fingerprint, { name: 'Clerk' });
  await replay(other, memberJoin.fingerprint, { name: 'Other' });
  await runtime.db.query("UPDATE members SET department_id = 'forms' WHERE member_id = 'm_clerk'");
  server.invalidateIdentity('m_clerk');
  await runtime.db.query("UPDATE members SET department_id = 'records' WHERE member_id = 'm_other'");
  server.invalidateIdentity('m_other');

  // ── Forms holds `members.write.update` — for their own row only ──
  await replay(clerk, memberIssue.fingerprint, { memberId: 'm_other', name: 'Forged', title: 'Forged', quirk: 'Forged' });
  const issued = await row('m_other');
  check('Forms cannot write somebody else\'s ID card (the projector shows it)', issued?.name === 'Other' && issued.title === null);

  await replay(clerk, memberAssign.fingerprint, { memberId: 'm_other', departmentId: 'archive', at: new Date().toISOString() });
  check('Forms cannot move somebody else to another department (their roles)', (await row('m_other'))?.department_id === 'records');

  await replay(clerk, memberUnassign.fingerprint, { memberId: 'm_other' });
  check('Forms cannot take somebody else out of their department', (await row('m_other'))?.department_id === 'records');

  await replay(clerk, memberRename.fingerprint, { memberId: 'm_other', name: 'Renamed' });
  check('the rename, aimed at somebody else, changes nobody else', (await row('m_other'))?.name === 'Other');

  // ── …and their own row is still theirs to change ──
  await replay(clerk, memberRename.fingerprint, { memberId: 'm_clerk', name: 'Ada Clerk' });
  check('Forms can still rename themselves', (await row('m_clerk'))?.name === 'Ada Clerk');

  // ── a member without the verb is refused outright ──
  const refused = await replay(other, memberIssue.fingerprint, { memberId: 'm_other', name: 'Self', title: 'Self', quirk: 'Self' });
  check(`a member without members.write.update is refused (${refused})`, refused >= 400 && (await row('m_other'))?.name === 'Other');

  // ── the fix does not reach too far: the room-wide writers still reach ──
  await replay(await tokenOf('registry'), memberIssue.fingerprint, { memberId: 'm_other', name: 'Issued', title: 'Clerk', quirk: 'On file.' });
  check('the registry still writes anybody\'s ID card', (await row('m_other'))?.name === 'Issued');

  const speaker = await tokenOf('speaker');
  await replay(speaker, memberAssign.fingerprint, { memberId: 'm_other', departmentId: 'archive', at: new Date().toISOString() });
  check('the speaker still assigns anybody', (await row('m_other'))?.department_id === 'archive');
  await replay(speaker, memberUnassign.fingerprint, { memberId: 'm_other' });
  check('…and takes anybody back out', (await row('m_other'))?.department_id === null);

  await close();
  finish();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
