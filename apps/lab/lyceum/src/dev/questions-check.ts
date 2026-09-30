// QUESTIONS CHECK — the room's Q&A, and what may be shown of it. Against the
// real boot, with the checks' moderator (server/moderation.ts: a few words are
// not fit, nothing else is caught).
//
//   1. a question sent is a row in the sender's name, stamped by the engine,
//      and in their own list;
//   2. the speaker's list shows it only once the moderator found it fit; one
//      that is not fit is kept — a row, with its verdict — and never shown;
//   3. nobody else's: a member replaying the speaker's read is refused, and
//      the stage holds nothing of Q&A;
//   4. the question form is not on a phone until Q&A is installed (Acme, on
//      stage — integration-check): a member holds no question action.
//
// A question is not edited or taken back: it is judged once, as it was sent.
import { mintSession } from '@niscorp/moss';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import { questionSend, questionsAll, questionsMine } from '@lyceum/app/vex/question.entries';
import { boot } from '@lyceum/server/boot';
import { check, finish } from './harness';

const main = async (): Promise<void> => {
  const { server, runtime, app, close } = await boot();

  const replay = async (token: string, fingerprint: string, context: Record<string, unknown> = {}): Promise<{ status: number; body: string }> => {
    const response = await server.request('/api/vex', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ fingerprint, context }),
    });
    return { status: response.status, body: await response.text() };
  };
  const join = async (memberId: string, name: string): Promise<string> => {
    const token = await mintSession(runtime.pool, memberId, 60_000);
    await replay(token, memberJoin.fingerprint, { name });
    // As the door does: they were nobody a moment ago, and are a member now.
    server.invalidateIdentity(memberId);
    return token;
  };
  const verdictOf = async (text: string): Promise<boolean | undefined> =>
    (await runtime.db.query<{ appropriate: boolean }>('SELECT v.appropriate FROM question_verdicts v JOIN questions q USING (question_id) WHERE q.text = $1', [text])).rows[0]?.appropriate;
  // The moderator judges as a question arrives (a reaction): wait for its verdict.
  const verdictSoon = async (text: string): Promise<boolean | undefined> => {
    for (let i = 0; i < 100; i += 1) {
      const verdict = await verdictOf(text);
      if (verdict !== undefined) return verdict;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  };

  const ada = await join('m_ada', 'Quiet Otter');
  const ben = await join('m_ben', 'Brave Heron');
  const speaker = await mintSession(runtime.pool, 'speaker', 60_000);

  // ── 1 ──
  await replay(ada, questionSend.fingerprint, { text: 'Is the model on stage the same one on my phone?' });
  const row = (await runtime.db.query<{ member_id: string }>("SELECT member_id FROM questions WHERE text = 'Is the model on stage the same one on my phone?'")).rows[0];
  check('a question sent is a row, in the sender\'s name, stamped by the engine', row?.member_id === 'm_ada');
  check('…and in their own list', (await replay(ada, questionsMine.fingerprint)).body.includes('Is the model on stage the same one on my phone?'));

  // ── 2 ──
  check('the moderator finds it fit to show', (await verdictSoon('Is the model on stage the same one on my phone?')) === true);
  check('…and then the speaker\'s list shows it', (await replay(speaker, questionsAll.fingerprint)).body.includes('Is the model on stage the same one on my phone?'));
  await replay(ben, questionSend.fingerprint, { text: 'Why is the speaker such an idiot?' });
  check('a question not fit to show is kept, with its verdict', (await verdictSoon('Why is the speaker such an idiot?')) === false);
  check('…and never on the speaker\'s list', !(await replay(speaker, questionsAll.fingerprint)).body.includes('idiot'));
  check('…though its sender still sees it among their own', (await replay(ben, questionsMine.fingerprint)).body.includes('Why is the speaker such an idiot?'));

  // ── 3 ──
  const asBen = await replay(ben, questionsAll.fingerprint);
  check(`a member replaying the speaker's read is refused — never anybody else's (${asBen.status})`, asBen.status >= 400 && !asBen.body.includes('same one on my phone'));
  const actionsOf = (role: string): unknown => {
    const def = app.charter[role];
    return def === undefined || Array.isArray(def) ? [] : (def.actions ?? []);
  };
  const stageActions = actionsOf('stage');
  check('the stage holds nothing of Q&A', !JSON.stringify(stageActions).includes('questions'));

  // ── 4 ──
  const member = actionsOf('member');
  check('a member holds no question action: the form comes with Q&A, installed on stage', !JSON.stringify(member).includes('questions'));

  await close();
  finish();
};

await main();
