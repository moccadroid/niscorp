// The assistant's deterministic claims, keyless.
//
// The keys are blanked (world imports no-llm first), so the agent runs its whole
// path and reports "no key" instead of reaching a network. What this proves is
// the machinery: the dock on every shell, memory as scoped rows, knowledge that
// cannot exceed the caller's ceiling, and the one contract both entry points
// apply.
//
// Run: pnpm --filter atrium exec tsx src/dev/assistant-check.ts
import type { FetchFn, Shell } from '@niscorp/nova';
import { login, settle, mounted, tap, sql, server, check, report } from './world';
import { mintToken } from '../server/users';
import { makeTools } from '../server/assistant/tools';
import { loadActions, queriesNow, grantedOf, definitionsNow, type AvailableAction } from '../server/assistant/knowledge';
import { apply, createLedger, seedFor, type Session } from '../server/assistant/contract';
import { mountInputKeys } from '@niscorp/nova/reflect';
import { chatPlacesFor, profileOf } from '../server/assistant/profiles';

// A per-principal wire with moss's own unwrap behaviour — what the tools ride in
// production, reproduced so a check can drive them directly.
const wireFor = (username: string): FetchFn => {
  const token = mintToken(username);
  return async (url, init) => {
    const res = await server.request(url, {
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers ?? {}), ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });
    if (!url.split('?')[0]?.endsWith('/vex') || !res.ok) return res;
    const body = (await res.json()) as Record<string, unknown> | null;
    const result = body !== null && typeof body === 'object' && 'result' in body ? body['result'] : body;
    return { ok: res.ok, status: res.status, json: () => Promise.resolve(result), text: () => Promise.resolve(JSON.stringify(result)) };
  };
};

const definitions = definitionsNow();
const asAction = (id: string): AvailableAction => ({
  id,
  title: definitions[id]?.title ?? id,
  blurb: '',
  capabilities: [],
  keywords: '',
  input: (definitions[id] as { input?: unknown } | undefined)?.input ?? { properties: {} },
});

const dataOf = (shell: Shell, instanceId: string | undefined): Record<string, unknown> =>
  instanceId === undefined ? {} : (shell.getRuntime(instanceId)?.getData() ?? {});

const main = async (): Promise<void> => {
  const personas = await sql(`SELECT audience, name FROM assistants ORDER BY audience`);
  check(`five personas seeded (${personas.map((p) => String(p['name'])).join(', ')})`, personas.length === 5);

  // ── the dock is on every shell ──
  const amara = login('amara');
  const rosa = login('rosa');
  const kwame = login('kwame');
  const henrik = login('henrik');
  const vendor = login('atrium');
  await settle();
  for (const [who, shell] of [['amara', amara], ['rosa', rosa], ['kwame', kwame], ['henrik', henrik], ['vendor', vendor]] as const) {
    check(`${who} carries the assistant`, mounted(shell, 'assistant')[0] === 'assistant');
  }

  // ── memory is rows, and a keyless send still persists both sides ──
  tap(amara, 'assistant', 'open');
  tap(amara, 'assistant', 'draft', 'do I owe you anything?', 'ui:model');
  tap(amara, 'assistant', 'send');
  await settle(12);
  const turns = await sql(`SELECT role, body, user_id FROM assistant_turns ORDER BY id`);
  check('the ask is a row', turns.some((t) => t['role'] === 'user' && String(t['body']).includes('owe')));
  check('the answer is a row', turns.some((t) => t['role'] === 'assistant'));
  check('both pinned to the asker', turns.every((t) => t['user_id'] === 'gst_amara'));

  // ── knowledge cannot exceed the ceiling ──
  const rosaActions = await loadActions(wireFor('rosa'), 'desk', 'prop_lumen', 'any', grantedOf('stf_rosa'));
  const amaraActions = await loadActions(wireFor('amara'), 'guest', 'prop_lumen', 'in_house', grantedOf('gst_amara'));
  check(`rosa's ACTIONS resolve (${rosaActions.length})`, rosaActions.length > 0);
  check('...all within her charter grants', rosaActions.every((a) => grantedOf('stf_rosa').includes(a.id)));
  check('...and no guest surface among them', !rosaActions.some((a) => a.id.startsWith('stay.')));
  check(`amara's ACTIONS resolve (${amaraActions.length})`, amaraActions.length > 0);
  check('...and no desk surface among them', !amaraActions.some((a) => a.id.startsWith('desk.')));

  // ── the data API is FETCHED, not recited, and filtered by the charter ──
  const rosaQueries = queriesNow('stf_rosa');
  const amaraQueries = queriesNow('gst_amara');
  check(`the desk's queries resolve (${rosaQueries.length})`, rosaQueries.length > 20);
  check(`a guest's are a different set (${amaraQueries.length})`, amaraQueries.length !== rosaQueries.length);
  // The list names only what the charter lets this person read. `properties/
  // capabilities` reads `property_capabilities`, which the ops manager holds and
  // the desk does not — so it is in one set and absent from the other. The
  // engine refuses it either way; the point is not teaching a word that dies.
  const has = (list: typeof rosaQueries, fingerprint: string): boolean => list.some((query) => query.fingerprint === fingerprint);
  check("the desk is not shown a read it cannot make", !has(rosaQueries, 'properties/capabilities'));
  check('...while operations is', has(queriesNow('stf_henrik'), 'properties/capabilities'));
  check('anonymous is shown nothing at all', queriesNow(null).length === 0);

  const deskTools = makeTools(rosa, wireFor('rosa'), rosaActions, { audience: 'desk', stayId: '', propertyId: 'prop_lumen', principal: 'stf_rosa' });
  const listTool = deskTools.find((t) => t.config.name === 'list_queries');
  const queryTool = deskTools.find((t) => t.config.name === 'query');
  const listed = await listTool?.config.execute({}, {} as never);
  check('list_queries names them on demand', String(listed).includes('issues/board'));
  check('...and filters', String(await listTool?.config.execute({ about: 'issue' }, {} as never)).split('\n').every((line) => line.toLowerCase().includes('issue')));
  const refusedFingerprint = await queryTool?.config.execute({ fingerprint: 'not/a/query' }, {} as never);
  check('an unknown fingerprint is refused', String(refusedFingerprint).includes('Unknown fingerprint'));
  const realRead = await queryTool?.config.execute({ fingerprint: 'issues/board', context: { propertyId: 'prop_lumen', status: 'open' } }, {} as never);
  check('a real one returns rows', Array.isArray(realRead));

  // ── the screen is not a tool ──
  const guestTools = makeTools(amara, wireFor('amara'), amaraActions, { audience: 'guest', stayId: 'stay_amara', propertyId: 'prop_lumen', principal: 'gst_amara' });
  check(`staff hold two tools: ${deskTools.map((t) => t.config.name).join(', ')}`, deskTools.length === 2 && queryTool !== undefined && listTool !== undefined);
  check('a guest also holds the desk handoff', guestTools.map((t) => t.config.name).includes('message_desk'));
  check(
    'nothing can push, update, pop or remove',
    ![...deskTools, ...guestTools].some((t) => ['push', 'update', 'pop', 'remove_instance'].includes(t.config.name)),
  );

  // ── rule 14: only declared keys survive, and the session pins the rest ──
  const session: Session = { stayId: '', propertyId: 'prop_lumen' };
  const seeded = seedFor(asAction('desk.issue.detail'), { issueId: 'iss_001', propertyId: 'prop_marisol', nonsense: true }, session);
  check('an undeclared key is dropped', !('nonsense' in seeded));
  check("the property is the session's, not the caller's", seeded['propertyId'] === 'prop_lumen');

  // ── the mount-input derivation, read off the definitions ──
  check('the issue detail loads by issueId', mountInputKeys(definitions['desk.issue.detail']!).has('issueId'));
  check('the conversation loads by stayId', mountInputKeys(definitions['desk.thread.detail']!).has('stayId'));
  check('...and its draft is not one of those', !mountInputKeys(definitions['desk.thread.detail']!).has('draft'));

  // ── the contract, applied ──
  const ledger = createLedger();
  const actions = [asAction('desk.issue.detail'), asAction('desk.thread.detail'), asAction('desk.thread.detail')];
  const FULL = profileOf('full').places;

  await settle(10);
  if (mounted(rosa, 'work').length === 0) rosa.push('work', 'desk.issue.list', { propertyId: 'prop_lumen' });
  await settle(10);
  const hers = JSON.stringify(mounted(rosa, 'work'));

  apply(rosa, ledger, actions, session, FULL, {
    columns: {
      aside: [
        { id: 'desk.issue.detail', input: { issueId: 'iss_001' } },
        { id: 'desk.thread.detail', input: { stayId: 'stay_amara' } },
      ],
    },
  });
  await settle(12);
  check('an answer places what it names', mounted(rosa, 'aside').length === 2);

  const before = rosa.getState().canvases['aside']?.stack[0]?.id;
  apply(rosa, ledger, actions, session, FULL, { columns: { aside: [{ id: 'desk.issue.detail', input: { issueId: 'iss_lift' } }] } });
  await settle(14);
  const reaimed = rosa.getState().canvases['aside']?.stack[0];
  check('a card the answer omits is closed', mounted(rosa, 'aside').length === 1);
  check('re-aiming re-opens rather than writing an id over stale rows', before !== reaimed?.id);
  check('...and the card reloaded for the new record', (dataOf(rosa, reaimed?.id)['issue'] as Record<string, unknown>)?.['issue_id'] === 'iss_lift');

  const again = apply(rosa, ledger, actions, session, FULL, { columns: { aside: [{ id: 'desk.issue.detail', input: { issueId: 'iss_lift' } }] } });
  check('re-stating the same card changes nothing', again.changed === false);
  check('her own canvas is untouched throughout', JSON.stringify(mounted(rosa, 'work')) === hers);

  // ── fill: their card, one field, no re-mount ──
  rosa.push('detail', 'desk.thread.detail', { stayId: 'stay_amara', guestName: 'Amara Osei' }, ['detail']);
  await settle(14);
  const theirs = rosa.getState().canvases['detail']?.stack.at(-1)?.id;
  const filled = apply(rosa, ledger, actions, session, FULL, {
    columns: { aside: [{ id: 'desk.issue.detail', input: { issueId: 'iss_lift' } }] },
    fill: [{ id: 'desk.thread.detail', input: { draft: 'Held for 8pm.', stayId: 'stay_theo' } }],
  });
  await settle(10);
  check('a fill lands in their open card', dataOf(rosa, theirs)['draft'] === 'Held for 8pm.');
  check('...without taking the card', rosa.getState().canvases['detail']?.stack.at(-1)?.id === theirs);
  check(
    '...and a key that decides its load is refused',
    filled.notes.some((n) => n.includes('stayId')) && dataOf(rosa, theirs)['stayId'] === 'stay_amara',
  );

  // ── a granted canvas is the assistant's, whoever opened what is on it ──
  // Naming the canvas is what asserts about it. Silence about a column leaves
  // the column alone, which is what keeps one narrow answer about the aside from
  // wiping a queue and a conversation.
  const untouched = JSON.stringify(mounted(rosa, 'detail'));
  apply(rosa, ledger, actions, session, FULL, { columns: { aside: [] } });
  await settle(8);
  check('a canvas the answer never names is left alone', JSON.stringify(mounted(rosa, 'detail')) === untouched);
  check('...including the record they opened themselves', rosa.getState().canvases['detail']?.stack.at(-1)?.id === theirs);

  // `columns: {}` is the commonest answer there is: the model deciding the
  // screen is already right. It must change nothing, including the assistant's
  // OWN cards, which an empty reconcile per granted canvas used to close.
  apply(rosa, ledger, actions, session, FULL, { columns: { aside: [{ id: 'desk.issue.detail', input: { issueId: 'iss_lift' } }] } });
  await settle(12);
  const standing = JSON.stringify({ work: mounted(rosa, 'work'), detail: mounted(rosa, 'detail'), aside: mounted(rosa, 'aside') });
  check('a card is on the aside to be lost', mounted(rosa, 'aside').length === 1);
  const nothing = apply(rosa, ledger, actions, session, FULL, { columns: {} });
  await settle(8);
  check('an empty `columns` changes nothing at all', JSON.stringify({ work: mounted(rosa, 'work'), detail: mounted(rosa, 'detail'), aside: mounted(rosa, 'aside') }) === standing);
  check('...and reports no change', nothing.changed === false);
  check('...and closes nothing', nothing.closed.size === 0);

  apply(rosa, ledger, actions, session, FULL, {
    columns: { detail: [{ id: 'desk.thread.detail', input: { draft: 'Car booked for six.' } }] },
  });
  await settle(10);
  check('naming their card writes into it', dataOf(rosa, theirs)['draft'] === 'Car booked for six.');
  check('...in place, so the record stays the one they were reading', rosa.getState().canvases['detail']?.stack.at(-1)?.id === theirs);

  apply(rosa, ledger, actions, session, FULL, { columns: { detail: [] } });
  await settle(8);
  check('naming a canvas without their card closes it', mounted(rosa, 'detail').length === 0);

  // ── the dial bounds the WATCHER; the dock is dial-blind ──
  const hersNow = JSON.stringify(mounted(rosa, 'work'));
  const mixed = apply(rosa, ledger, actions, session, profileOf('mixed').places, { columns: { work: [{ id: 'desk.issue.detail' }] } });
  check('a mixed watcher cannot place on work', mixed.notes.some((n) => n.includes('refused work')));
  check('...and her list survived it', JSON.stringify(mounted(rosa, 'work')) === hersNow);
  check('off places nothing', profileOf('authored').places.length === 0);
  check('off does not watch', profileOf('authored').watches === false);
  check('the dock answers staff with the whole screen, whatever the dial', chatPlacesFor('desk').join() === 'work,detail,aside');
  check('a guest asks into the sheet', chatPlacesFor('guest').join() === 'sheet');

  report('the assistant');
};

await main();
