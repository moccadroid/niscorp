import type { MossServer } from '@niscorp/moss';
import { answersRecent } from '../app/vex/answers.entries';
import { personInvite } from '../app/vex/people.entries';
import { boot } from '../server/boot';
import { recordOf } from '../server/compose/record';
import { checks } from './checks';
import { OWNER, offline, scriptedModels, settle, until } from './scripted';

const { check, finish } = checks('history');

const scripted = scriptedModels({
  'One thing': [{ title: 'The first', areas: [{ area: 'a', say: { title: 'One', text: 'The first answer.' } }], arrangement: 'single' }],
  'Two things': [{ title: 'The second', areas: [{ area: 'a', say: { title: 'One', text: 'Again.' } }, { area: 'b', say: { title: 'Two', text: 'Beside it.' } }], arrangement: 'pair' }],
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
const said = (session: Session, area: string): string => String(dataOn(session, area)['title'] ?? '');
const drawn = (session: Session): string => JSON.stringify(session.shell.flattenRenderTree(session.shell.getShellRenderTree()));
const press = (session: Session, ref: string, payload?: string): void => session.dispatch('dock', { type: 'ui:click', ref, ...(payload === undefined ? {} : { payload }) });
const kept = async (token: string): Promise<unknown[]> => {
  const answer = await server.fetch(new Request('http://mira.test/api/vex', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: answersRecent.fingerprint, context: {} }) }));
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
  press(owner, 'screen', 'people');
  await until(() => shown(owner)['screen'] === 'people');
  await settle();
  const rows = await kept(ownerToken);
  check('each answer to a message is kept as a row of the person’s, and a screen opened is not', rows.length === 2 && JSON.stringify(rows).includes('The second') && !JSON.stringify(rows).includes('People'), JSON.stringify(rows).slice(0, 300));

  shells.reset((await server.principalOf(ownerToken)) ?? '');
  const again = await open(ownerToken);
  await until(() => shown(again)['label'] === 'The second');
  check('a new shell opens on the answer they were last given, with its canvases', shown(again)['label'] === 'The second' && said(again, 'a') === 'One' && said(again, 'b') === 'Two', `${String(shown(again)['label'])}: ${said(again, 'a')} / ${said(again, 'b')}`);
  check('…laid out as it was', drawn(again).includes('"name":"b"'));
  check('…and the stack behind it: the first screen, then their answers in order', shown(again)['total'] === 3 && shown(again)['position'] === 3, JSON.stringify(shown(again)['stack']));
  press(again, 'back');
  await until(() => shown(again)['label'] === 'The first');
  check('back goes through them', said(again, 'a') === 'One' && shown(again)['position'] === 2);
  press(again, 'back');
  await until(() => shown(again)['label'] === 'Start');
  check('…to the first screen', shown(again)['position'] === 1);

  await server.fetch(new Request('http://mira.test/api/vex', { method: 'POST', headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: personInvite.fingerprint, context: { email: 'ada@example.com', name: 'Ada' } }) }));
  const adaToken = (await door.signIn('ada@example.com')) ?? '';
  const ada = await open(adaToken);
  await settle();
  check('somebody else keeps none of them: Ada opens on the first screen, alone in her stack', shown(ada)['label'] === 'Start' && shown(ada)['total'] === 1 && (await kept(adaToken)).length === 0, JSON.stringify(shown(ada)));
} catch (error) {
  check('the history ran to the end', false, error instanceof Error ? (error.stack ?? error.message) : String(error));
}

finish();
