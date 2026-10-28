import { renderDocument } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { personInvite, ownerAdmit, peopleList } from '../app/vex/people.entries';
import { linkIssue } from '../app/vex/links.entries';
import { boot } from '../server/boot';
import { drawing } from '../server/document';
import type { Mail } from '../server/identity';
import { checks } from './checks';
import { OWNER, offline, scriptedModels, settle, until } from './scripted';

const { check, finish } = checks('signin');

const mails: Mail[] = [];
const scripted = scriptedModels({ hello: [{ title: 'Hello', cards: [{ say: { title: 'Hello', text: 'Hi.' } }] }] });
const { server, door } = await boot(offline(scripted.models, () => undefined, async (mail) => void mails.push(mail)));
door.routes(server);
await server.checkFunctions();

type Session = Awaited<ReturnType<NonNullable<MossServer['shells']>['session']>>;
const shells = server.shells;
if (shells === undefined) throw new Error('the manifest has no shell');

const actionOn = (session: Session, canvas: string): string => session.shell.getState().canvases[canvas]?.active?.definitionId ?? '';
const dataOn = (session: Session, canvas: string): Record<string, unknown> => {
  const active = session.shell.getState().canvases[canvas]?.active;
  return active === undefined ? {} : (session.shell.getRuntime(active.id)?.getData() ?? {});
};
const drawn = (session: Session): string => JSON.stringify(session.shell.flattenRenderTree(session.shell.getShellRenderTree()));
const type = (session: Session, canvas: string, ref: string, text: string): void => session.dispatch(canvas, { type: 'ui:model', ref, payload: text });
const press = (session: Session, canvas: string, ref: string): void => session.dispatch(canvas, { type: 'ui:click', ref });
const page = async (cookie: string | null): Promise<string> => (await renderDocument({ ...drawing, server, template: '<!doctype html><html><head></head><body><div id="root"></div></body></html>', request: { path: '/', cookie } })).html;
const login = async (token: string): Promise<Response> => server.fetch(new Request(`http://mira.test/login?token=${token}`));
const tokenIn = (mail: Mail | undefined): string => /token=([\w-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
const tokenOf = (response: Response): string => /nisc\.token=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1] ?? '';
const people = async (): Promise<string> => {
  const rows = await server.executeAs('identity', peopleList.fingerprint, {});
  return (Array.isArray(rows) ? rows : []).map((row: unknown) => JSON.stringify(row)).join('\n');
};

// Through the sign-in card, as nobody: the address typed and sent.
const ask = async (email: string): Promise<{ session: Session; sent: number }> => {
  const session = await shells.session(null, null);
  session.shell.flattenRenderTree(session.shell.getShellRenderTree());
  const before = mails.length;
  type(session, 'a', 'email', email);
  press(session, 'a', 'send');
  await until(() => dataOn(session, 'a')['sent'] === true || dataOn(session, 'a')['error'] !== '');
  await settle();
  return { session, sent: mails.length - before };
};

const signedIn = async (email: string): Promise<{ session: Session; token: string }> => {
  await ask(email);
  const answer = await login(tokenIn(mails[mails.length - 1]));
  const token = tokenOf(answer);
  const session = await shells.session(token, await server.principalOf(token));
  session.shell.flattenRenderTree(session.shell.getShellRenderTree());
  return { session, token };
};

try {
  const nobody = await shells.session(null, null);
  check('nobody signed in gets the sign-in and nothing else: no dock, no answers', actionOn(nobody, 'a') === 'signin.door' && actionOn(nobody, 'dock') === '', `${actionOn(nobody, 'a')} / ${actionOn(nobody, 'dock')}`);
  const strangerPage = await page(null);
  check('the page drawn for nobody is the sign-in', strangerPage.includes('Sign in') && !strangerPage.includes('k-dock'), strangerPage.slice(0, 200));

  const stranger = await ask('stranger@example.com');
  check('a stranger’s address is answered as any other, and mailed nothing', dataOn(stranger.session, 'a')['sent'] === true && stranger.sent === 0);
  const nonsense = await ask('not an address');
  check('what is not an email address is refused, saying so', String(dataOn(nonsense.session, 'a')['error']).includes('not an email address') && nonsense.sent === 0, String(dataOn(nonsense.session, 'a')['error']));

  const owner = await ask(` ${OWNER.toUpperCase()} `);
  const link = tokenIn(mails[mails.length - 1]);
  check('the owner’s address, however it is typed, is mailed one link to /login', owner.sent === 1 && mails[mails.length - 1]?.to === OWNER && link !== '' && (mails[mails.length - 1]?.text ?? '').includes('http://mira.test/login?token='));
  const redeemed = await login(link);
  const ownerToken = tokenOf(redeemed);
  check('the link signs them in: a redirect home, with the session in a cookie no script reads', redeemed.status === 302 && redeemed.headers.get('location') === '/' && ownerToken !== '' && (redeemed.headers.get('set-cookie') ?? '').includes('HttpOnly'), String(redeemed.status));
  const again = await login(link);
  check('the same link a second time signs nobody in', again.status === 410 && tokenOf(again) === '', String(again.status));
  await server.executeAs('gatekeeper', linkIssue.fingerprint, { tokenHash: 'a'.repeat(64), email: OWNER, expiresAt: new Date(Date.now() - 1000).toISOString() });
  check('nor does a link that has expired, or one never made', (await login('expired')).status === 410 && (await login('')).status === 410);

  const ownerPage = await page(`nisc.token=${ownerToken}`);
  check('the page drawn for the owner is the first screen, with the dock', ownerPage.includes('k-dock') && !ownerPage.includes('Send me a link'), ownerPage.slice(0, 200));
  const ownerSession = await shells.session(ownerToken, await server.principalOf(ownerToken));
  ownerSession.shell.flattenRenderTree(ownerSession.shell.getShellRenderTree());
  check('the owner’s dock lists the People screen', drawn(ownerSession).includes('"label":"People"'));

  ownerSession.dispatch('dock', { type: 'ui:click', ref: 'screen', payload: 'people' });
  await until(() => actionOn(ownerSession, 'a') === 'people.list' && Array.isArray(dataOn(ownerSession, 'a')['rows']) && JSON.stringify(dataOn(ownerSession, 'a')['rows']).includes(OWNER));
  check('the People screen lists who may sign in: the owner', actionOn(ownerSession, 'a') === 'people.list' && JSON.stringify(dataOn(ownerSession, 'a')['rows']).includes('"role":"owner"'));
  ownerSession.shell.flattenRenderTree(ownerSession.shell.getShellRenderTree());
  type(ownerSession, 'a', 'email', 'nobody');
  press(ownerSession, 'a', 'invite');
  await until(() => dataOn(ownerSession, 'a')['error'] !== '' && dataOn(ownerSession, 'a')['inviting'] === false);
  check('what is not an address is not invited, and the card says so in a sentence', String(dataOn(ownerSession, 'a')['error']).includes('Is it an email address?') &&!(await people()).includes('"email":"nobody"'), String(dataOn(ownerSession, 'a')['error']));
  type(ownerSession, 'a', 'email', ' Ada@Example.com ');
  type(ownerSession, 'a', 'name', 'Ada');
  press(ownerSession, 'a', 'invite');
  await until(() => JSON.stringify(dataOn(ownerSession, 'a')['rows']).includes('ada@example.com'));
  check('the owner invites Ada from it: a member, her address lower-cased', (await people()).includes('"email":"ada@example.com","name":"Ada","role":"member"'), await people());

  const ada = await signedIn('ada@example.com');
  check('Ada signs in by her own link, and holds the app but not the People screen', actionOn(ada.session, 'dock') === 'ask.dock' && !drawn(ada.session).includes('"label":"People"'));
  const adaInvites = await server.fetch(new Request('http://mira.test/api/vex', { method: 'POST', headers: { authorization: `Bearer ${ada.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: personInvite.fingerprint, context: { email: 'eve@example.com', name: 'Eve' } }) }));
  check('Ada cannot invite anybody', !adaInvites.ok && !(await people()).includes('eve@example.com'), String(adaInvites.status));
  await server.fetch(new Request('http://mira.test/api/vex', { method: 'POST', headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: ownerAdmit.fingerprint, context: { email: 'second@example.com' } }) }));
  check('and no write of the owner’s makes another owner', !(await people()).includes('"email":"second@example.com","name":null,"role":"owner"'), await people());

  check('each sees their own screens: the owner on People, Ada still on Start', actionOn(ownerSession, 'a') === 'people.list' && actionOn(ada.session, 'a') === 'answer.text');
  type(ada.session, 'dock', 'text', 'hello');
  ada.session.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
  await until(() => scripted.prompts.length > 0);
  await settle();
  type(ownerSession, 'dock', 'text', 'hello');
  ownerSession.dispatch('dock', { type: 'ui:key', ref: 'text', key: 'Enter' });
  await until(() => scripted.prompts.length > 1);
  const [adaPrompt = '', ownerPrompt = ''] = scripted.prompts;
  check('the model is offered only what the person may use: the owner the People card, Ada not', ownerPrompt.includes('people.list') && !adaPrompt.includes('people.list'));
  check('and nobody is given the app’s reads and writes', [ownerPrompt, adaPrompt].every((prompt) => !prompt.includes('people/') && !prompt.includes('links/') && !prompt.includes('answers/')));
} catch (error) {
  check('the sign-in ran to the end', false, error instanceof Error ? (error.stack ?? error.message) : String(error));
}

finish();
