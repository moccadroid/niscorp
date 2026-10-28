import { randomUUID } from 'node:crypto';
import type { MossServer } from '@niscorp/moss';
import { answerKeep, answersRecent, answersSaid } from '../app/vex/answers.entries';
import { personInvite } from '../app/vex/people.entries';
import { boot } from '../server/boot';
import { recordOf } from '../server/compose/record';
import { checks } from './checks';
import { OWNER, offline, scriptedModels, settle, until } from './scripted';

const { check, finish } = checks('history');

const scripted = scriptedModels({
  'One thing': [{ title: 'The first', columns: 1, cards: [{ say: { title: 'One', text: 'The first answer.' } }] }],
  'Two things': [{ title: 'The second', columns: 2, cards: [{ say: { title: 'One', text: 'Again.' } }, { say: { title: 'Two', text: 'Beside it.' } }] }],
  'How many are there?': [{ title: 'Count', response: 'There are two cards on this screen.', cards: [] }],
  'And now?': [{ title: 'Count again', response: 'Still two.', cards: [] }],
  'Who is here?': [{ title: 'Who', columns: 1, cards: [{ action: 'people.list', input: {}, intent: 'who is here' }] }],
});
const { server, door } = await boot(offline(scripted.models, () => undefined));
const shells = server.shells;
if (shells === undefined) throw new Error('the manifest has no shell');

type Session = Awaited<ReturnType<NonNullable<MossServer['shells']>['session']>>;

const dataOn = (session: Session, canvas: string): Record<string, unknown> => {
  const active = session.shell.getState().canvases[canvas]?.active;
  return active === undefined ? {} : (session.shell.getRuntime(active.id)?.getData() ?? {});
};
const shown = (session: Session): Record<string, unknown> => recordOf(dataOn(session, 'dock')['current']);
const cardOn = (session: Session, place: number): Record<string, unknown> => {
  const instance = session.shell.getState().canvases['screen']?.stack[place - 1];
  return instance === undefined ? {} : (session.shell.getRuntime(instance.id)?.getData() ?? {});
};
const said = (session: Session, place: number): string => String(cardOn(session, place)['title'] ?? '');
const drawn = (session: Session): string => JSON.stringify(session.shell.flattenRenderTree(session.shell.getShellRenderTree()));
const press = (session: Session, ref: string, payload?: string): void => session.dispatch('dock', { type: 'ui:click', ref, ...(payload === undefined ? {} : { payload }) });
const kept = async (token: string, fingerprint = answersRecent.fingerprint): Promise<unknown[]> => {
  const answer = await server.fetch(new Request('http://mira.test/api/vex', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context: {} }) }));
  const rows = recordOf(await answer.json())['result'];
  return Array.isArray(rows) ? rows : [];
};
const ask = async (session: Session, text: string): Promise<void> => {
  const before = Number(shown(session)['total']);
  session.dispatch('dock', { type: 'ui:model', ref: 'text', payload: text });
  session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
  await until(() => Number(shown(session)['total']) > before);
  await settle();
};
const open = async (token: string): Promise<Session> => {
  const session = await shells.session(token, await server.principalOf(token));
  session.shell.flattenRenderTree(session.shell.getShellRenderTree());
  return session;
};

try {
  const ownerToken = (await door.signIn(OWNER)) ?? '';
  const owner = await open(ownerToken);
  await until(() => shown(owner)['label'] === 'Start');
  await ask(owner, 'One thing');
  await ask(owner, 'Two things');
  owner.dispatch('dock', { type: 'ui:model', ref: 'text', payload: 'How many are there?' });
  owner.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
  await until(() => shown(owner)['said'] === 'There are two cards on this screen.');
  await settle();
  press(owner, 'screen', 'people');
  await until(() => shown(owner)['screen'] === 'people');
  await settle();
  const rows = await kept(ownerToken);
  check('each answer to a message is kept as a row of the person’s, and a screen opened is not', rows.length === 2 && JSON.stringify(rows).includes('The second') && !JSON.stringify(rows).includes('People'), JSON.stringify(rows).slice(0, 300));
  check('…with the grammars its screen was written at', rows.every((row) => JSON.stringify(recordOf(row)['grammar']).includes('"nisc.nova"')), JSON.stringify(rows.map((row) => recordOf(row)['grammar'])));
  const saidRows = (await kept(ownerToken, answersSaid.fingerprint)).map(recordOf);
  check(
    'a message that left the screen as it was is kept too, with what was said back and the answer it was asked on',
    saidRows.length === 3 && saidRows[0]?.['question'] === 'How many are there?' && saidRows[0]['response'] === 'There are two cards on this screen.' && saidRows[0]['asked_on'] === recordOf(rows[0])['id'],
    JSON.stringify(saidRows).slice(0, 400),
  );

  const store = (context: Record<string, unknown>): Promise<Response> =>
    Promise.resolve(server.fetch(new Request('http://mira.test/api/vex', { method: 'POST', headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: answerKeep.fingerprint, context }) })));
  const [second] = rows;
  const stored = [
    await store({ id: randomUUID(), question: 'broken', title: 'Broken', response: '', grammar: {}, plan: { canvases: 'nonsense', arrangement: 'single', layout: {} }, askedOn: null, screen: null }),
    await store({
      id: randomUUID(),
      question: 'from before cards',
      title: 'From before',
      response: '',
      grammar: { 'nisc.nova': 2, 'nisc.prism': 3 },
      plan: {
        canvases: { a: [{ action: 'answer.text', input: { title: 'Left', text: 'On the left.', tone: 'default' }, intent: 'left' }], b: [{ action: 'answer.text', input: { title: 'Wide', text: 'Under it.', tone: 'default' }, intent: 'wide' }] },
        arrangement: 'written',
        layout: { component: 'Grid', props: { columns: 2 }, children: [{ component: 'Area', props: { name: 'a', span: 1 }, children: [{ component: 'CanvasSlot', props: { canvasId: 'a' } }] }, { component: 'Area', props: { name: 'b', span: 2 }, children: [{ component: 'CanvasSlot', props: { canvasId: 'b' } }] }] },
        ink: 'turn-2',
        inks: { a: 'turn-1', b: 'turn-2' },
        marks: { b: 'new' },
      },
      askedOn: null,
      screen: null,
    }),
    await store({ id: randomUUID(), question: 'from later', title: 'From later', response: '', grammar: { 'nisc.nova': 999 }, plan: recordOf(second)['plan'], askedOn: null, screen: null }),
  ];
  check('two answers that will not read, and one kept before cards had keys, are stored', stored.every((response) => response.ok), stored.map((response) => response.status).join(' '));

  shells.reset((await server.principalOf(ownerToken)) ?? '');
  const again = await open(ownerToken);
  await until(() => shown(again)['label'] === 'From before');
  check('an answer that no longer reads, or that newer code wrote, is left out, and the rest stay', !JSON.stringify(shown(again)['stack']).includes('Broken') && !JSON.stringify(shown(again)['stack']).includes('From later'), JSON.stringify(shown(again)['stack']));
  check(
    'an answer kept before the screen was one canvas reads as its cards in the order of its areas, laid out, inked and marked as it was',
    said(again, 1) === 'Left' && said(again, 2) === 'Wide' && drawn(again).includes('"name":"2","span":2,"row":2,"column":1,"ink":"turn-2","fresh":"new"') && drawn(again).includes('"name":"1","span":1,"row":1,"column":1,"ink":"turn-1"}'),
    drawn(again).match(/"name":"Area","props":\{[^}]*\}/g)?.join(' ') ?? '',
  );
  press(again, 'back');
  await until(() => shown(again)['label'] === 'The second');
  check('a new shell opens with the answers they were given, with their cards', said(again, 1) === 'One' && said(again, 2) === 'Two', `${String(shown(again)['label'])}: ${said(again, 1)} / ${said(again, 2)}`);
  check('…laid out as it was', drawn(again).includes('"name":"2"'));
  check('…its cards in the inks they were in, and marked as they were', shown(again)['ink'] === 'turn-2' && drawn(again).includes('"ink":"turn-2","fresh":"changed"') && drawn(again).includes('"ink":"turn-2","fresh":"new"'), String(shown(again)['ink']));
  check('…and the stack behind it: the first screen, then their answers in order', shown(again)['total'] === 4 && shown(again)['position'] === 3, JSON.stringify(shown(again)['stack']));
  again.dispatch('dock', { type: 'ui:model', ref: 'text', payload: 'And now?' });
  again.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
  await until(() => shown(again)['said'] === 'Still two.');
  const prompt = scripted.prompts[scripted.prompts.length - 1] ?? '';
  check(
    '…and the model is given what they asked before this shell, and what it replied',
    prompt.includes('\n\nTwo things\n\nScripted.\n\n') && prompt.includes('\n\nHow many are there?\n\nThere are two cards on this screen.\n\n') && prompt.endsWith('\n\nAnd now?'),
    prompt.slice(0, 500),
  );
  press(again, 'back');
  await until(() => shown(again)['label'] === 'The first');
  check('back goes through them', said(again, 1) === 'One' && shown(again)['position'] === 2 && shown(again)['ink'] === 'turn-1');
  press(again, 'back');
  await until(() => shown(again)['label'] === 'Start');
  check('…to the first screen', shown(again)['position'] === 1);

  await ask(again, 'Who is here?');
  await until(() => Array.isArray(cardOn(again, 1)['rows']) && JSON.stringify(cardOn(again, 1)['rows']).includes(OWNER));
  press(again, 'back');
  await until(() => shown(again)['label'] === 'From before');
  await settle();
  shells.reset((await server.principalOf(ownerToken)) ?? '');
  const third = await open(ownerToken);
  await until(() => shown(third)['label'] === 'Who');
  press(third, 'back');
  await until(() => shown(third)['label'] === 'From before');
  third.dispatch('dock', { type: 'ui:click', ref: 'chip' });
  await until(() => Array.isArray(dataOn(third, 'overview')['answers']) && JSON.stringify(dataOn(third, 'overview')['answers']).includes('"label":"Who"'));
  const pictured = JSON.stringify(recordOf((dataOn(third, 'overview')['answers'] as unknown[]).map(recordOf).find((entry) => entry['label'] === 'Who'))['layers']);
  check('an answer’s cards as nova drew them are kept with it: a new shell’s overview draws it by its people', pictured.includes(OWNER) && pictured.includes('"name":"Card"'), pictured.slice(0, 300));
  const who = (dataOn(third, 'overview')['answers'] as unknown[]).map(recordOf).find((entry) => entry['label'] === 'Who');
  third.dispatch('overview', { type: 'ui:click', ref: 'close', payload: who?.['position'] });
  await until(() => !JSON.stringify(dataOn(third, 'overview')['answers']).includes('"label":"Who"'));
  await settle();
  shells.reset((await server.principalOf(ownerToken)) ?? '');
  const fourth = await open(ownerToken);
  await settle();
  check('an answer closed stays closed in a new shell', !JSON.stringify(shown(fourth)['stack']).includes('"Who"') && shown(fourth)['label'] === 'From before', JSON.stringify(shown(fourth)['stack']));
  check('…and stays in the conversation', JSON.stringify(await kept(ownerToken, answersSaid.fingerprint)).includes('Who is here?'));

  await server.fetch(new Request('http://mira.test/api/vex', { method: 'POST', headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: personInvite.fingerprint, context: { email: 'ada@example.com', name: 'Ada' } }) }));
  const adaToken = (await door.signIn('ada@example.com')) ?? '';
  const ada = await open(adaToken);
  await settle();
  check('somebody else keeps none of them: Ada opens on the first screen, alone in her stack', shown(ada)['label'] === 'Start' && shown(ada)['total'] === 1 && (await kept(adaToken)).length === 0, JSON.stringify(shown(ada)));
} catch (error) {
  check('the history ran to the end', false, error instanceof Error ? (error.stack ?? error.message) : String(error));
}

finish();
