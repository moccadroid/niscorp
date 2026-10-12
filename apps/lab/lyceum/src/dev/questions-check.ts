import { mintSession } from '@niscorp/moss';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import { questionSend, questionsEvery, questionsMine, questionsShown, verdictsAll } from '@lyceum/app/vex/question.entries';
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
    server.invalidateIdentity(memberId);
    return token;
  };
  const verdictOf = async (text: string): Promise<boolean | undefined> =>
    (await runtime.db.query<{ appropriate: boolean }>('SELECT v.appropriate FROM question_verdicts v JOIN questions q USING (question_id) WHERE q.text = $1', [text])).rows[0]?.appropriate;
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

  await replay(ada, questionSend.fingerprint, { text: 'Is the model on stage the same one on my phone?' });
  const row = (await runtime.db.query<{ member_id: string }>("SELECT member_id FROM questions WHERE text = 'Is the model on stage the same one on my phone?'")).rows[0];
  check('a question sent is a row, in the sender\'s name, stamped by the engine', row?.member_id === 'm_ada');
  check('…and in their own list', (await replay(ada, questionsMine.fingerprint)).body.includes('Is the model on stage the same one on my phone?'));

  check('the moderator finds it fit to show', (await verdictSoon('Is the model on stage the same one on my phone?')) === true);
  check('…and then it may be shown', (await replay(speaker, questionsShown.fingerprint)).body.includes('Is the model on stage the same one on my phone?'));
  await replay(ben, questionSend.fingerprint, { text: 'Why is the speaker such an idiot?' });
  check('a question not fit to show is kept, with its verdict', (await verdictSoon('Why is the speaker such an idiot?')) === false);
  check('…and never among what may be shown', !(await replay(speaker, questionsShown.fingerprint)).body.includes('idiot'));
  const everything = (await replay(speaker, questionsEvery.fingerprint)).body;
  check('the speaker reads every question, fit or not', everything.includes('idiot') && everything.includes('same one on my phone'));
  const speakerVerdicts = (await replay(speaker, verdictsAll.fingerprint)).body;
  check('…and every verdict, both ways', speakerVerdicts.includes('"appropriate":false') && speakerVerdicts.includes('"appropriate":true'));
  check('…though its sender still sees it among their own', (await replay(ben, questionsMine.fingerprint)).body.includes('Why is the speaker such an idiot?'));

  const asBen = await replay(ben, questionsEvery.fingerprint);
  check(`a member replaying the speaker's read gets their own question and nobody else's (${asBen.status})`, asBen.body.includes('idiot') && !asBen.body.includes('same one on my phone'));
  const benVerdicts = await replay(ben, verdictsAll.fingerprint);
  check(`…and no verdict at all (${benVerdicts.status})`, benVerdicts.status >= 400);
  const stage = await mintSession(runtime.pool, 'stage', 60_000);
  const stageEvery = await replay(stage, questionsEvery.fingerprint);
  check(`the stage reads no question itself (${stageEvery.status})`, stageEvery.status >= 400 && !stageEvery.body.includes('idiot'));
  const stageVerdicts = (await replay(stage, verdictsAll.fingerprint)).body;
  check('the stage, asking for every verdict, gets the fit one and never the other', stageVerdicts.includes('"appropriate":true') && !stageVerdicts.includes('"appropriate":false'));
  check('…and what may be shown is the fit question, by its words', (await replay(stage, questionsShown.fingerprint)).body.includes('same one on my phone'));
  const actionsOf = (role: string): unknown => {
    const def = app.charter[role];
    return def === undefined || Array.isArray(def) ? [] : (def.actions ?? []);
  };

  const member = actionsOf('member');
  check('a member holds no question action: the form comes with Q&A, installed on stage', !JSON.stringify(member).includes('questions'));

  await close();
  finish();
};

await main();
