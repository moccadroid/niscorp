// One sentence, three shells, one row.
//
// A guest reports a fault on a phone. It appears on the front desk's board in
// her words, the clerk dispatches it, it lands on a maintenance phone, and the
// open-issues count moves at the source. Nothing is copied between surfaces —
// the same `issues` row is read by every application.
//
// Run: pnpm --filter atrium exec tsx src/dev/thread-check.ts
import { login, settle, topData, mounted, tap, cardData, openFromMenu, sql, check, report } from './world';

type Row = Record<string, unknown>;
const rows = (data: Record<string, unknown>, key: string): Row[] => (Array.isArray(data[key]) ? (data[key] as Row[]) : []);

const main = async (): Promise<void> => {
  const amara = await login('amara'); // in house, The Lumen, room 412
  const rosa = await login('rosa'); // front desk, The Lumen
  const kwame = await login('kwame'); // maintenance, The Lumen
  await settle();

  // The manager's count is the `issues/openCount` read; the DB is the bus, so
  // the row moving IS the fact. Asserted at the source.
  const openIssues = async (): Promise<number> =>
    Number((await sql(`SELECT count(*) AS count FROM issues WHERE property_id = 'prop_lumen' AND status = 'open'`))[0]?.['count'] ?? -1);
  const openBefore = await openIssues();
  // Nothing is seeded onto the work column — it is a stack a clerk pushes onto,
  // and the menu is the way in.
  await openFromMenu(rosa, 'desk.issue.list');
  const boardBefore = rows(topData(rosa, 'work'), 'rows').length;

  // ── the guest ──
  // Open the report action the way a tile does: pushed onto the sheet canvas,
  // wearing the sheet fragment, seeded from the shell's own session data.
  const slot = rows(topData(amara, 'main'), 'slots').find((s) => s['slot_id'] === 'gs_report');
  check('reporting a problem is on her shell', slot !== undefined);

  tap(amara, 'main', 'open', slot);
  await settle();
  check('the report action opened on the sheet', mounted(amara, 'sheet').includes('stay.request'));

  // The category menu is loaded from the ticketing integration, not hardcoded —
  // pick the real "Air conditioning" option the DB returned.
  const options = rows(topData(amara, 'sheet'), 'options');
  check(`the ticketing system supplied the category menu (${options.length} options)`, options.length > 0);
  const acOption = options.find((o) => String(o['label']).includes('Air conditioning'));
  check('...including Air conditioning', acOption !== undefined);

  tap(amara, 'sheet', 'choose', acOption);
  tap(amara, 'sheet', 'detail', 'It rattles under load and I have a 6am flight.', 'ui:model');
  tap(amara, 'sheet', 'send');
  await settle();
  check('she is told it went through', topData(amara, 'sheet')['done'] === true);

  // ── the row ──
  const raised = await sql(`SELECT * FROM issues WHERE stay_id = 'stay_amara' ORDER BY raised_at DESC LIMIT 1`);
  const issue = raised[0];
  check('an issue exists', issue !== undefined);
  check('...against the right property', issue?.['property_id'] === 'prop_lumen');
  check('...against her actual room, taken from the stay', issue?.['room_id'] === 'rm_l_412');
  check('...in her words', String(issue?.['detail'] ?? '').includes('6am flight'));
  check('...marked as raised by the guest', issue?.['raised_by'] === 'guest');

  // ── the desk ──
  // No push: Rosa's board re-reads when she next reads. Model it (a nav back to
  // the board, or a NOTIFY nudge) by firing the channel her board listens on.
  rosa.publish('issues-changed');
  await settle();
  const board = rows(topData(rosa, 'work'), 'rows');
  check(`the front desk board grew (${boardBefore} → ${board.length})`, board.length === boardBefore + 1);
  const onBoard = board.find((r) => r['issue_id'] === issue?.['id']);
  check('her report is the top of the board', onBoard !== undefined);
  check('the clerk reads her own words, not a summary of them', String(onBoard?.['detail'] ?? '').includes('6am flight'));

  // The clerk opens it — as its OWN surface on top of the queue, loaded from the
  // id rather than handed the clicked row. That is what makes the same issue
  // openable by a link or by the assistant.
  tap(rosa, 'work', 'row', onBoard);
  await settle(8);
  check('opening it pushes the issue as its own surface', mounted(rosa, 'detail').at(-1) === 'desk.issue.detail');
  check('...loaded from the id it was given', topData(rosa, 'detail')['issueId'] === issue?.['id']);
  check('...and it read the issue itself', (topData(rosa, 'detail')['issue'] as Row)?.['issue_id'] === issue?.['id']);

  // Dispatching happens ON the issue, not on a surface over it: the clerk can
  // still read what they are sending on while they choose who to send it to.
  check('the dispatch controls are on the issue itself', mounted(rosa, 'detail').at(-1) === 'desk.issue.detail');
  check('...with the floor already read', (topData(rosa, 'detail')['staff'] as unknown[]).length > 0);
  tap(rosa, 'detail', 'send');
  await settle(8);
  const dispatched = await sql(`SELECT * FROM tasks WHERE issue_id = $1`, [issue?.['id']]);
  check('a task was dispatched for it', dispatched.length === 1);
  check('...titled from the issue and the room', String(dispatched[0]?.['title'] ?? '').includes('412'));

  // ── the floor ──
  // The task has no assignee yet — the desk dispatches to the property, and
  // picking it up is the floor's move. Assign it and prove the phone sees it.
  await sql(`UPDATE tasks SET assignee_id = 'stf_kwame' WHERE issue_id = $1`, [issue?.['id']]);
  // The floor opens its own work from its own menu — the same one door every
  // staff surface goes through now.
  await openFromMenu(kwame, 'service.tasks');
  check('maintenance opens its work from the menu', mounted(kwame, 'work').includes('service.tasks'));
  kwame.publish('tasks-changed');
  tap(kwame, 'work', 'tab', 'open');
  await settle();
  const work = rows(topData(kwame, 'work'), 'rows');
  const job = work.find((t) => String(t['title'] ?? '').includes('412'));
  check('it is on the maintenance phone', job !== undefined);

  tap(kwame, 'work', 'done', job);
  await settle();
  const closed = await sql(`SELECT status FROM tasks WHERE issue_id = $1`, [issue?.['id']]);
  check('marking it done writes through', closed[0]?.['status'] === 'done');

  // ── the manager's count ──
  const openAfter = await openIssues();
  check(`the open-issues count moved (${openBefore} → ${openAfter})`, openAfter === openBefore + 1);

  // And the clerk closes the loop. The issue never left the screen — sending it
  // on folded the controls away and left the record where it was.
  check('the issue is still open after sending', mounted(rosa, 'detail').at(-1) === 'desk.issue.detail');
  tap(rosa, 'detail', 'resolve');
  await settle(8);
  const resolved = await sql(`SELECT status FROM issues WHERE id = $1`, [issue?.['id']]);
  check('the desk resolved the issue', resolved[0]?.['status'] === 'resolved');

  const openFinal = await openIssues();
  check(`the count closed with it (${openAfter} → ${openFinal})`, openFinal === openBefore);

  // ── and the guest was told, without asking ──
  const hers = rows(topData(amara, 'main'), 'slots');
  check('her shell is still live and still hers', hers.length > 0 && topData(amara, 'main')['stayId'] === 'stay_amara');

  report('one sentence through four applications');
};

void main();
