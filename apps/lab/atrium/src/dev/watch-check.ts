if (process.argv.includes('--trace')) process.env['WATCH_TRACE'] = '1';
process.env['WATCH_QUIET_MS'] = '60';
process.env['WATCH_WARMUP_MS'] = '120';

import { login, settle, cardOf, openFromMenu, mounted, runtime, check, report } from './world';
import { definitionsNow } from '../server/assistant/knowledge';
import { WATCHED, fingerprintOf, changesBetween, navigatedBetween } from '../server/assistant/watch/screen-diff';
import { ASSISTANT, apply, createLedger } from '../server/assistant/contract';
import { wakes, clearWakes, printable, type Wake } from '../server/assistant/watch/trace';
import { watching, stopWatching } from '../server/assistant/watch';

const fatal: string[] = [];
process.on('unhandledRejection', (reason) => {
  fatal.push(`unhandledRejection: ${String(reason instanceof Error ? (reason.stack ?? reason.message) : reason)}`);
});
process.on('uncaughtException', (error) => {
  fatal.push(`uncaughtException: ${String(error.stack ?? error.message)}`);
});

// Only escapes that originate in the watcher count: the sabotage below breaks
// a shell method moss's own flush loop also calls.
const fromWatcher = (): string[] => fatal.filter((entry) => /assistant[\\/]watch/.test(entry));

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const nextWake = async (principal: string, within = 4000): Promise<Wake | undefined> => {
  const until = Date.now() + within;
  while (Date.now() < until) {
    const last = wakes(principal).at(-1);
    if (last !== undefined) return last;
    await wait(50);
  }
  return undefined;
};

const shown = (wake: Wake | undefined, needle: string): string => (wake?.context ?? []).map((m) => String(m.content)).find((c) => c.includes(needle)) ?? '';

const setMode = (principal: string, mode: string): Promise<unknown> =>
  runtime.db.query(`UPDATE staff SET layout_control = $1 WHERE id = $2`, [mode, principal]);

const main = async (): Promise<void> => {
  await setMode('stf_rosa', 'full');

  const rosa = await login('rosa');
  await login('kwame');
  await login('amara');
  await settle(14);
  await wait(600);
  check('the desk is watched', watching().includes('stf_rosa'));
  check('maintenance is not', !watching().includes('stf_kwame'));
  check('a guest is not', !watching().includes('gst_amara'));

  check('login composed a whole screen without waking anything', wakes('stf_rosa').length === 0);

  clearWakes();
  await openFromMenu(rosa, 'desk.message.list');
  const navWake = await nextWake('stf_rosa');
  check('navigating wakes it', navWake !== undefined);
  check("...with what changed, in the clerk's terms", (navWake?.reasons ?? []).some((r) => r.startsWith('the user opened') && r.includes('on work')));
  check('...keyless, so it stops at the prompt', navWake?.outcome === 'no-key');
  check('...and it is told which canvases it holds', shown(navWake, 'YOUR CANVASES').includes('work, detail, aside'));
  check('...the resolved action catalog, by action id', shown(navWake, '── ACTIONS ──').includes('desk.message.list'));
  check('...naming no slot ids', !shown(navWake, '── ACTIONS ──').includes('ds_inbox'));
  check('...and the query list is NOT in the prompt', !(navWake?.context ?? []).some((m) => String(m.content).includes('issues/board — Issues at a property')));
  check('...and neither is any tool to fetch it', !(navWake?.context ?? []).some((m) => String(m.content).includes('list_queries')));
  check('...so it is told to answer, not to look', (navWake?.context ?? []).some((m) => String(m.content).includes('FINISH PROTOCOL') && !String(m.content).includes('Use your tools')));

  clearWakes();
  const inbox = cardOf(rosa, 'desk.message.list', 'work');
  const feed = (rosa.getRuntime(inbox)?.getData()['feed'] ?? []) as Record<string, unknown>[];
  rosa.dispatch({ type: 'ui:click', ref: 'open-thread', payload: feed[0], origin: inbox } as Parameters<typeof rosa.dispatch>[0]);
  const rowWake = await nextWake('stf_rosa');
  check('clicking a row wakes it', rowWake !== undefined);
  check('...and the reason carries the record', (rowWake?.reasons ?? []).some((r) => r.startsWith('the user opened') && r.includes('on detail') && r.includes('stay_')));
  check('...and never as a close of the same card', !(rowWake?.reasons ?? []).some((r) => r.includes('closed') && r.includes('The conversation')));

  clearWakes();
  const listRuntime = rosa.getRuntime(inbox);
  listRuntime?.setData({ ...listRuntime.getData(), feed: [...feed], loading: false });
  await wait(1200);
  check('a load does not wake it', wakes('stf_rosa').length === 0);

  const ledger = createLedger();
  const ours = (id: string): boolean => rosa.originOf(id) === ASSISTANT;
  const zero = fingerprintOf(rosa, definitionsNow(), ours);
  const mine = rosa.push('aside', 'desk.issue.detail', { issueId: 'iss_001', propertyId: 'prop_lumen' }, [], { origin: ASSISTANT });
  await settle(10);
  check('nova records who placed it', rosa.originOf(mine) === ASSISTANT);
  check('a card it placed is not a change', changesBetween(zero, fingerprintOf(rosa, definitionsNow(), ours)).length === 0);
  check('...and placing is not them navigating', !navigatedBetween(zero, fingerprintOf(rosa, definitionsNow(), ours)));

  // `dispatching` is the issue surface's own controls toggle: a person's
  // gesture, not a load.
  const staged = fingerprintOf(rosa, definitionsNow(), ours);
  const stagedRuntime = rosa.getRuntime(mine);
  stagedRuntime?.setData({ ...stagedRuntime.getData(), dispatching: true });
  await settle(6);
  const used = changesBetween(staged, fingerprintOf(rosa, definitionsNow(), ours));
  check('using a card it placed IS a change', used.some((line) => line.includes('dispatching')));
  check('...and it reads as them, not as a field', used.some((line) => line.startsWith('the user used')));
  const asOurs = { wrote: new Map([[mine, new Set(['dispatching'])]]) };
  check('...unless the answer wrote it, which is our own typing', changesBetween(staged, fingerprintOf(rosa, definitionsNow(), ours), asOurs).length === 0);

  rosa.removeInstance('aside', mine);
  await settle(6);
  check('closing its own card is not a change either', changesBetween(zero, fingerprintOf(rosa, definitionsNow(), ours)).length === 0);
  check('...and the origin died with the instance', rosa.originOf(mine) === undefined);

  const theirCard = rosa.push('detail', 'desk.issue.detail', { issueId: 'iss_wifi', propertyId: 'prop_lumen' }, ['detail']);
  await settle(10);
  check('a card the clerk opened is not ours', rosa.originOf(theirCard) !== ASSISTANT);
  const beforeAnswer = fingerprintOf(rosa, definitionsNow(), ours);

  const catalogue = ['desk.issue.detail'].map((id) => ({
    id,
    title: definitionsNow()[id]?.title ?? id,
    blurb: '',
    capabilities: [],
    keywords: '',
    also: [],
    input: (definitionsNow()[id] as { input?: unknown } | undefined)?.input ?? { properties: {} },
  }));
  const answered = apply(rosa, ledger, catalogue, { stayId: '', propertyId: 'prop_lumen' }, ['work', 'detail', 'aside'], { columns: { detail: [] } });
  await settle(10);
  check('an answer can close a card the clerk opened', mounted(rosa, 'detail').length === 0);
  check('...and reports having closed it', answered.closed.has(theirCard));
  check(
    '...so the next wake is NOT told the user closed it',
    !changesBetween(beforeAnswer, fingerprintOf(rosa, definitionsNow(), ours), answered).some((line) => line.includes('the user closed')),
  );
  check(
    '...though uncredited it would read as theirs',
    changesBetween(beforeAnswer, fingerprintOf(rosa, definitionsNow(), ours)).some((line) => line.includes('the user closed')),
  );


  const here = fingerprintOf(rosa, definitionsNow(), ours);
  const theirs = rosa.getRuntime(inbox);
  theirs?.setData({ ...theirs.getData(), reading: 'half a drafted reply' });
  await settle(6);
  check('a value moving in their card is not navigation', !navigatedBetween(here, fingerprintOf(rosa, definitionsNow(), ours)));
  check('...though it is still a change', changesBetween(here, fingerprintOf(rosa, definitionsNow(), ours)).length > 0);
  const wentTo = rosa.push('detail', 'desk.issue.detail', { issueId: 'iss_003', propertyId: 'prop_lumen' }, []);
  await settle(10);
  check('...but a card of theirs opening is', navigatedBetween(here, fingerprintOf(rosa, definitionsNow(), ours)));
  rosa.removeInstance('detail', wentTo);
  await settle(6);

  check('the column it offers on is watched', WATCHED.includes('aside'));
  check('the dock is unwatched', !WATCHED.includes('assistant'));
  check('the record column is watched', WATCHED.includes('detail'));

  const offered = rosa.push('aside', 'desk.issue.detail', { issueId: 'iss_003', propertyId: 'prop_lumen' }, [], { origin: ASSISTANT });
  ledger.remember(offered, { definitionId: 'desk.issue.detail', title: 'The issue', aim: '{"issueId":"iss_003"}', at: Date.now() });
  await settle(8);
  clearWakes();
  rosa.removeInstance('aside', offered);
  await settle(8);
  ledger.sweep(rosa);
  check('closing an offer is recorded as a refusal', ledger.dismissals().some((d) => d.definitionId === 'desk.issue.detail'));
  await wait(800);
  check('...and does not wake it again', wakes('stf_rosa').length === 0);
  check('the refusal reaches the prompt', ledger.lines().includes('REFUSED'));

  stopWatching();
  await setMode('stf_rosa', 'authored');
  const quiet = await login('rosa');
  await settle(14);
  await wait(600);
  check('a person who turned it off has no watcher', !watching().includes('stf_rosa'));
  clearWakes();
  await openFromMenu(quiet, 'desk.issue.list');
  await wait(1500);
  check('...so a gesture costs nothing at all', wakes('stf_rosa').length === 0);
  check('...and their own screen still works', mounted(quiet, 'work').length > 0);
  await setMode('stf_rosa', 'full');

  await setMode('stf_pilar', 'full');
  const pilar = await login('pilar');
  await settle(14);
  await wait(400);
  check('the other desk is watched too', watching().includes('stf_pilar'));
  await openFromMenu(pilar, 'desk.message.list');
  const card = (pilar.getState().canvases['work']?.stack ?? [])[0];
  check('she has a surface open to touch', card !== undefined);
  (pilar as unknown as Record<string, unknown>)['getRuntime'] = (): never => {
    throw new Error('shell is gone');
  };
  if (card !== undefined) pilar.dispatch({ type: 'ui:click', ref: 'open-thread', payload: {}, origin: card.id } as Parameters<typeof pilar.dispatch>[0]);
  await wait(1200);
  const escaped = fromWatcher();
  check(`nothing escapes the watcher into the process${escaped.length > 0 ? ` — got ${escaped.length}` : ''}`, escaped.length === 0);
  check('...and it retires itself rather than throwing forever', !watching().includes('stf_pilar'));

  if (process.env['WATCH_TRACE'] === '1') for (const wake of wakes()) console.log(printable(wake));
  stopWatching();
  report('the watcher');
};

await main();
