// `world` before `surface`: it boots pglite, which reads its environment at
// load, and `surface` installs a DOM over the same globals.
import { anonymous, app, login, ok, report, settle } from './world';
import { CAST } from '@lyra/db/seed';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
import { fillPhrase } from '@niscorp/nova/i18n';
import type { RenderNode } from '@niscorp/nova';
import { all, click, draw, errorMarkers, events, find, namesIn, resize, show, text } from './surface';

const treeOf = (shell: { flattenRenderTree: (nodes: RenderNode[]) => RenderNode[]; getShellRenderTree: () => RenderNode[] }): RenderNode[] =>
  shell.flattenRenderTree(shell.getShellRenderTree());

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

type Cell = { kind?: string; key?: string; subKey?: string; suffix?: string };
const shownBy = (cell: Cell, row: Record<string, unknown>): string[] => {
  const at = (key: string | undefined): string => {
    if (key === undefined) return '';
    const value = fillPhrase(row[key]);
    return value === undefined || value === null ? '' : String(value);
  };
  switch (cell.kind) {
    case 'text':
    case 'number':
      return [at(cell.key)];
    case 'badge':
      return [at(cell.key)];
    case 'primary':
    case 'avatar':
      return [at(cell.key), at(cell.subKey) === at(cell.key) ? '' : at(cell.subKey)];
    default:
      return [];
  }
};

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

const PRINCIPALS: [string, string | null, string][] = [
  ['an owner', CAST.lumen.owner, 'Maren'],
  ['the front desk', CAST.lumen.desk, 'Lumen Yoga'],
  ['an instructor', CAST.lumen.instructor, 'Lumen Yoga'],
  ['a member', CAST.lumen.member, 'Ava'],
  ['anonymous', null, 'Sign in'],
];

for (const [who, email, expected] of PRINCIPALS) {
  const shell = email === null ? await anonymous() : await login(email);
  await settle(10);
  const tree = treeOf(shell);
  remember(tree);
  await show(tree);
  const markers = errorMarkers();
  ok(`${who} gets a screen that draws`, markers.length === 0 && text().length > 80, markers.length > 0 ? markers.join(', ') : `${text().length} characters on screen`);
  ok(`...saying what the tree says`, text().includes(expected), `"${expected}"`);
}

const DESTINATIONS = ['people.list', 'staff.list', 'plans.list', 'timetable.list', 'schedule.timetable', 'reports.overview', 'studio.settings', 'automations.list', 'campaigns.list', 'desk.checkin', 'programs.list'].filter(
  (id) => app.actions[id] !== undefined,
);

const owner = await login(CAST.lumen.owner);
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

owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(14);
const roll = treeOf(owner);
await show(roll);

// Somebody with something written down: a blank record makes a blank form correct.
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

owner.dispatch({ type: 'ui:click', ref: 'edit' });
await settle(16);
const form = treeOf(owner);
remember(form);
await show(form);
const fields = all('input, textarea, select');
ok('the edit form draws real fields', fields.length >= 3, `${fields.length} of them on the sheet`);

const owed = fieldsIn(form).filter(([, value]) => value !== '');
const held = new Set(fields.map((field) => String((field as HTMLInputElement).value ?? '')));
const blank = owed.filter(([, value]) => !held.has(value));
ok('...seeded with what the record holds', owed.length > 0 && blank.length === 0, blank.length > 0 ? `the tree says ${blank.map(([name, value]) => `${name}="${value.slice(0, 20)}"`).join(', ')}, the field is empty` : `${owed.length} field${owed.length === 1 ? '' : 's'} arrived filled in`);

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

// The untouched components are reported, not asserted: none of them is a fault.
const registered = COMPONENT_NAMES.filter((name) => name !== 'CanvasSlot' && name !== 'ActionSlot');
const exercised = registered.filter((name) => seen.has(name));
const untouched = registered.filter((name) => !seen.has(name));
ok('the kit is exercised by the screens, not by fixtures', exercised.length > registered.length / 2, `${exercised.length}/${registered.length} components drawn with real data`);
ok('...and the rest are named', true, untouched.length === 0 ? 'every registered component was drawn' : `never drawn here: ${untouched.join(', ')}`);

report('the kit draws it: every principal, every screen, every cell a spec names — and the two shapes of the navigation.');
