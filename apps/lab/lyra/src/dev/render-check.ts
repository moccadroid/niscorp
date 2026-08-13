// Render check — the kit draws what the server said.
//
// Every other suite stops at the render TREE: it asserts JSON, which is the
// engine's output and the component kit's input. Nothing has ever run the
// components. This mounts the real trees, for real principals, through the real
// registry, into a real DOM — and asks the only question the tree cannot
// answer: is what the server sent actually on the screen?
//
// The rule it exists for is the one the roster bug broke — a list that fetched
// ids and never joined them, showing raw keys while the check asserted names
// that only ever existed in props. A tree comparison cannot see that. A person
// can, and so can this.
//
// Run: pnpm --filter lyra exec tsx src/dev/render-check.ts
//
// `world` first: it boots pglite, which reads its environment at load, and
// `surface` installs a DOM over the same globals.
import { anonymous, app, login, ok, report, settle } from './world';
import { CAST } from '@lyra/db/seed';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
import type { RenderNode } from '@niscorp/nova';
import { all, click, draw, errorMarkers, events, find, namesIn, resize, show, text } from './surface';

const treeOf = (shell: { flattenRenderTree: (nodes: RenderNode[]) => RenderNode[]; getShellRenderTree: () => RenderNode[] }): RenderNode[] =>
  shell.flattenRenderTree(shell.getShellRenderTree());

/** Every string the server put in the tree as CONTENT — the words a person is owed. */
const wordsIn = (nodes: RenderNode[], into: string[] = []): string[] => {
  for (const item of nodes) {
    if (item.type === 'text') {
      const value = item.value.trim();
      if (value !== '') into.push(value);
    } else if (item.type === 'component' || item.type === 'fragment') {
      wordsIn(item.children, into);
    }
  }
  return into;
};

/** Every `Rows` node in a tree, with the props it was given. */
const rowsIn = (nodes: RenderNode[], into: Record<string, unknown>[] = []): Record<string, unknown>[] => {
  for (const item of nodes) {
    if (item.type === 'component') {
      if (item.name === 'Rows') into.push(item.props);
      rowsIn(item.children, into);
    } else if (item.type === 'fragment') {
      rowsIn(item.children, into);
    }
  }
  return into;
};

// What a cell of each kind puts on the screen. The vocabulary is closed
// (rows.tsx), so this can be exhaustive rather than a guess — and it is
// deliberately written from the SPEC, not from the component, so the two have
// to agree for the assertion to pass.
type Cell = { kind?: string; key?: string; subKey?: string; suffix?: string };
const shownBy = (cell: Cell, row: Record<string, unknown>): string[] => {
  const at = (key: string | undefined): string => {
    if (key === undefined) return '';
    const value = row[key];
    return value === undefined || value === null ? '' : String(value);
  };
  switch (cell.kind) {
    case 'text':
    case 'number':
      return [at(cell.key)];
    case 'badge':
      return [at(cell.key)];
    // A subtitle equal to its title is dropped on purpose, so it is not owed.
    case 'primary':
    case 'avatar':
      return [at(cell.key), at(cell.subKey) === at(cell.key) ? '' : at(cell.subKey)];
    default:
      // bands, icon, meter, menu, action — drawn rather than spelled.
      return [];
  }
};

/** Every field in a tree with the value the server gave it — `[name, value]`. */
const FIELDS = new Set(['Input', 'Textarea', 'Select', 'PersonPicker']);
const fieldsIn = (nodes: RenderNode[], into: [string, string][] = []): [string, string][] => {
  for (const item of nodes) {
    if (item.type === 'component') {
      const value = item.props['value'];
      if (FIELDS.has(item.name) && (typeof value === 'string' || typeof value === 'number')) into.push([item.name, String(value)]);
      fieldsIn(item.children, into);
    } else if (item.type === 'fragment') {
      fieldsIn(item.children, into);
    }
  }
  return into;
};

const seen = new Set<string>();
const remember = (nodes: RenderNode[]): void => namesIn(nodes).forEach((name) => seen.add(name));

// ── 1. every principal's shell draws ─────────────────────────
const PRINCIPALS: [string, string | null, string][] = [
  ['an owner', CAST.lumen.owner, 'Maren'],
  ['the front desk', CAST.lumen.desk, 'Lumen Yoga'],
  ['an instructor', CAST.lumen.instructor, 'Lumen Yoga'],
  ['a member', CAST.lumen.member, 'Ava'],
  ['anonymous', null, 'Sign in'],
];

for (const [who, email, expected] of PRINCIPALS) {
  const shell = email === null ? anonymous() : login(email);
  await settle(10);
  const tree = treeOf(shell);
  remember(tree);
  await show(tree);
  const markers = errorMarkers();
  ok(`${who} gets a screen that draws`, markers.length === 0 && text().length > 80, markers.length > 0 ? markers.join(', ') : `${text().length} characters on screen`);
  ok(`...saying what the tree says`, text().includes(expected), `"${expected}"`);
}

// ── 2. and every word the server sent is on it ───────────────
//
// The tree is the promise; the DOM is the delivery. A component that quietly
// drops its children — or renders them into an attribute — passes every JSON
// assertion in this directory and fails here.
const DESTINATIONS = ['people.list', 'staff.list', 'plans.list', 'timetable.list', 'schedule.timetable', 'reports.overview', 'studio.settings', 'automations.list', 'desk.checkin', 'programs.list'].filter(
  (id) => app.actions[id] !== undefined,
);

const owner = login(CAST.lumen.owner);
await settle(12);

let drawn = 0;
const swallowed: string[] = [];
const rowFaults: string[] = [];

for (const destination of DESTINATIONS) {
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: destination });
  await settle(14);
  const tree = treeOf(owner);
  remember(tree);
  await show(tree);

  const markers = errorMarkers();
  if (markers.length > 0) {
    swallowed.push(`${destination}: ${markers.join(', ')}`);
    continue;
  }
  const screen = text();
  const missing = wordsIn(tree).filter((word) => !screen.includes(word));
  if (missing.length > 0) swallowed.push(`${destination}: ${missing.slice(0, 3).map((w) => `"${w.slice(0, 24)}"`).join(', ')}`);
  else drawn += 1;

  // ── 3. …including the cells of every list on it ────────────
  for (const props of rowsIn(tree)) {
    const rows = Array.isArray(props['rows']) ? (props['rows'] as Record<string, unknown>[]) : [];
    const columns = Array.isArray(props['columns']) ? (props['columns'] as { cell?: Cell }[]) : [];
    for (const row of rows.slice(0, 8)) {
      for (const column of columns) {
        for (const owed of shownBy(column.cell ?? {}, row)) {
          if (owed !== '' && !screen.includes(owed)) rowFaults.push(`${destination}: "${owed.slice(0, 28)}" is in the data and not on the screen`);
        }
      }
    }
  }
}

ok('every screen an owner opens draws its own words', drawn === DESTINATIONS.length && swallowed.length === 0, swallowed.length === 0 ? `${DESTINATIONS.length} screens, nothing swallowed between tree and DOM` : swallowed.slice(0, 4).join(' · '));
ok('...and every list shows the cells its spec names', rowFaults.length === 0, rowFaults.length === 0 ? 'no column resolves to something the reader never sees' : [...new Set(rowFaults)].slice(0, 4).join(' · '));

// ── 4. the loop, closed ──────────────────────────────────────
//
// Everything above renders what the server said. This is the other direction,
// and no other check in this directory has it: a click on a real element, the
// event the KIT decided to emit, forwarded to the shell exactly as the wire
// does, and the screen that comes back. Both bugs that ever reached a browser
// died in this gap — one in the event, one in what the event carried.
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(14);
const roll = treeOf(owner);
await show(roll);

// Who to click is read from the SPEC — the column that carries the name — and
// then found on the screen by that name, so the click lands on the row a person
// would have aimed at. Somebody with something written down, because a blank
// record makes a blank form correct and the assertion below vacuous.
const spec = rowsIn(roll)[0] ?? {};
const rows = Array.isArray(spec['rows']) ? (spec['rows'] as Record<string, unknown>[]) : [];
const nameKey =
  (Array.isArray(spec['columns']) ? (spec['columns'] as { cell?: Cell }[]) : [])
    .map((column) => column.cell)
    .find((cell) => cell?.kind === 'avatar' || cell?.kind === 'primary')?.key ?? 'person_name';
const record = rows.find((row) => String(row[nameKey] ?? '').includes('Lena')) ?? rows[0] ?? {};
const somebody = String(record[nameKey] ?? '');
const chosen = all('.ly-row-item--clickable').find((el) => (el.textContent ?? '').includes(somebody)) ?? null;

await click(chosen);
const fired = [...events];
for (const event of fired) owner.dispatch(event);
await settle(16);
const opened = treeOf(owner);
remember(opened);
await show(opened);

ok('clicking a row opens that person', fired.length === 1 && somebody !== '' && text().includes(somebody), `clicked "${somebody}", the kit sent ${JSON.stringify(fired[0]?.payload).slice(0, 60)}`);
ok('...onto the sheet, over the roll', find('[role="dialog"]') !== null && text().includes(somebody), 'a record is something you do to the list, not a place you go');

// The form is where the components that hold their own state live — a draft, a
// caret, a decimal that leaves as cents. Nothing has ever rendered one.
owner.dispatch({ type: 'ui:click', ref: 'edit' });
await settle(16);
const form = treeOf(owner);
remember(form);
await show(form);
const fields = all('input, textarea, select');
ok('the edit form draws real fields', fields.length >= 3, `${fields.length} of them on the sheet`);

// A FIELD THE SERVER GAVE A VALUE MUST SHOW IT. `Input` keeps a local draft so
// a remote echo cannot clobber what somebody is typing, and the seam between
// that draft and the served value is the one place a form can silently arrive
// blank. It is a hook, so no tree records whether it worked.
const owed = fieldsIn(form).filter(([, value]) => value !== '');
const held = new Set(fields.map((field) => String((field as HTMLInputElement).value ?? '')));
const blank = owed.filter(([, value]) => !held.has(value));
ok('...seeded with what the record holds', owed.length > 0 && blank.length === 0, blank.length > 0 ? `the tree says ${blank.map(([name, value]) => `${name}="${value.slice(0, 20)}"`).join(', ')}, the field is empty` : `${owed.length} field${owed.length === 1 ? '' : 's'} arrived filled in`);

// ── 5. one arrangement, two shapes ───────────────────────────
//
// The navigation is the one place the kit decides something the server did not:
// a rail at a desk, a drawer behind a thumb bar on a phone. It is a media query
// inside a component, so no tree anywhere records which one happened.
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(12);

await resize(1280);
await show(treeOf(owner));
const rail = find('.ly-drawer--rail') !== null;
ok('at a desk the navigation is a rail', rail, rail ? 'always visible, no scrim' : 'the drawer never became a rail');

await resize(375);
await show(treeOf(owner));
const thumbBar = find('.ly-bar--bottom') !== null;
const overlay = find('.ly-drawer--rail') === null;
ok('on a phone it is a thumb bar, and the rail is gone', thumbBar && overlay, `${all('.ly-bar--bottom .ly-tab').length} destinations under a thumb`);
await resize(1280);

// ── 6. the states a screen full of data never shows ──────────
const LIST = {
  rowKey: 'id',
  columns: [
    { label: 'Name', cell: { kind: 'primary', key: 'name', subKey: 'sub' } },
    { label: 'Verb', px: 90, cell: { kind: 'action', label: 'Open', ref: 'go' } },
  ],
};

await draw('Rows', { ...LIST, rows: [], empty: 'Nobody here yet.', emptyHint: 'They appear once somebody signs up.' });
ok('an empty list says so', text().includes('Nobody here yet.') && text().includes('They appear once'), 'the empty state is the component’s, not each layout’s');
ok('...and draws no header over nothing', !text().includes('Verb'));

await draw('Rows', { ...LIST, rows: [], loading: true, empty: 'Nobody here yet.' });
ok('a loading list is a skeleton, not an empty state', !text().includes('Nobody here yet.') && find('[style*="animation"], .ly-skeleton') !== null, 'loading is not emptiness — the difference matters on a slow wire');

await draw('Rows', { ...LIST, rows: [{ id: '1', name: 'Fundamentals', sub: 'Fundamentals' }] });
const once = (text().match(/Fundamentals/g) ?? []).length;
ok('a subtitle repeating its title is dropped', once === 1, `printed ${once}×`);

await draw('Rows', { ...LIST, rows: [{ id: '1', name: 'Ada Byron' }], onRowRef: 'open' });
const row = find('.ly-row-item--clickable');
ok('a clickable row is reachable from a keyboard', row?.getAttribute('role') === 'button' && row?.getAttribute('tabindex') === '0');

// ── 7. what the screens actually exercised ───────────────────
//
// Reported rather than asserted: an unexercised component is not a fault, it is
// a component whose only proof is somebody clicking. The number is the point —
// it says how much of the kit these checks now stand behind.
const registered = COMPONENT_NAMES.filter((name) => name !== 'CanvasSlot' && name !== 'ActionSlot');
const exercised = registered.filter((name) => seen.has(name));
const untouched = registered.filter((name) => !seen.has(name));
ok('the kit is exercised by the screens, not by fixtures', exercised.length > registered.length / 2, `${exercised.length}/${registered.length} components drawn with real data`);
ok('...and the rest are named', true, untouched.length === 0 ? 'every registered component was drawn' : `never drawn here: ${untouched.join(', ')}`);

report('the kit draws it: every principal, every screen, every cell a spec names — and the two shapes of the navigation.');
