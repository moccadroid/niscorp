// ACCESS CHECK — what a person CANNOT do, over the same HTTP surface a phone's
// devtools reach: their own session token against moss's /api/vex, replaying
// any fingerprint the app serves.
//
// A write outside a person's reach is not always refused: it can be a
// statement that matches no row, answered 200 with nothing in it. So every
// assertion here reads the database as well as the status. And the fix must
// not reach too far: the write that is SUPPOSED to reach everybody's rows —
// the moderator's verdicts — still does.
//
// What used to be guarded here was the ID card, which only the registry
// wrote. The card is gone; what is written about a person now is whether their
// question may be shown, and only the moderator writes that.
import { mintSession } from '@niscorp/moss';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import { questionJudge, questionSend, verdictsAll } from '@lyceum/app/vex/question.entries';
import { boot } from '@lyceum/server/boot';
import { check, finish } from './harness';

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
  const questionId = async (text: string): Promise<string> =>
    (await runtime.db.query<{ question_id: string }>('SELECT question_id FROM questions WHERE text = $1', [text])).rows[0]?.question_id ?? '';
  // The moderator judges as a question arrives (a reaction): wait for its verdict.
  const verdictSoon = async (id: string): Promise<boolean | undefined> => {
    for (let i = 0; i < 100; i += 1) {
      const verdict = (await runtime.db.query<{ appropriate: boolean }>('SELECT appropriate FROM question_verdicts WHERE question_id = $1', [id])).rows[0]?.appropriate;
      if (verdict !== undefined) return verdict;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  };

  // Two people join, as themselves.
  const one = await tokenOf('m_one');
  const other = await tokenOf('m_other');
  await replay(one, memberJoin.fingerprint, { name: 'Quiet Otter' });
  await replay(other, memberJoin.fingerprint, { name: 'Brave Heron' });
  // As the door does: they were nobody a moment ago, and are members now.
  server.invalidateIdentity('m_one');
  server.invalidateIdentity('m_other');

  // ── a name is taken once ──
  await replay(await tokenOf('m_third'), memberJoin.fingerprint, { name: 'Quiet Otter' });
  const otters = (await runtime.db.query<{ n: number }>("SELECT count(*)::int AS n FROM members WHERE name = 'Quiet Otter'")).rows[0]?.n;
  check(`a name somebody has cannot be taken again (${String(otters)} Quiet Otter)`, otters === 1);

  // ── a question's verdict is the moderator's alone ──
  await replay(one, questionSend.fingerprint, { text: 'You are an idiot' });
  const own = await questionId('You are an idiot');
  const forged = await replay(one, questionJudge.fingerprint, { questionId: own, text: 'You are an idiot', appropriate: true, score: 1 });
  check(`a member cannot pass their own question as fit to show (${forged})`, forged >= 400);
  check('...the moderator judges it, and not fit to show', (await verdictSoon(own)) === false);
  await replay(other, questionSend.fingerprint, { text: 'Where are the slides?' });
  const theirs = await questionId('Where are the slides?');
  const meddled = await replay(one, questionJudge.fingerprint, { questionId: theirs, text: 'Where are the slides?', appropriate: false, score: 0 });
  check(`...nor judge somebody else's (${meddled})`, meddled >= 400);
  const read = await replay(one, verdictsAll.fingerprint, {});
  check(`...nor read the verdicts (${read})`, read >= 400);

  // ── the fix does not reach too far: the moderator reaches every question ──
  check('the moderator judges anybody\'s question — this one fit to show', (await verdictSoon(theirs)) === true);

  await close();
  finish();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
