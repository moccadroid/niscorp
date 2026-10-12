import { CATALOG_DEFINITIONS } from '@lyra/app/action-catalog';
import { ok, report } from './assert';
import { all, byText, click, draw, events, fill, find, focus, blur, press, text } from './surface';

type Bag = Record<string, unknown>;
const isBag = (value: unknown): value is Bag => value !== null && typeof value === 'object';

const READ = /@event\.payload((?:\.[A-Za-z_$][\w$]*)*)/g;

const pathsRead = (steps: unknown, into = new Set<string>()): Set<string> => {
  if (typeof steps === 'string') {
    for (const match of steps.matchAll(READ)) into.add((match[1] ?? '').replace(/^\./, ''));
    return into;
  }
  if (Array.isArray(steps)) {
    for (const item of steps) pathsRead(item, into);
    return into;
  }
  if (isBag(steps)) {
    for (const value of Object.values(steps)) pathsRead(value, into);
  }
  return into;
};

const readersOf = (definition: { triggers?: { event?: string; ref?: string; do?: unknown }[] }): Map<string, Set<string>> => {
  const out = new Map<string, Set<string>>();
  for (const trigger of definition.triggers ?? []) {
    if (trigger.event !== 'ui:click' || typeof trigger.ref !== 'string') continue;
    const found = pathsRead(trigger.do);
    const already = out.get(trigger.ref) ?? new Set<string>();
    for (const path of found) already.add(path);
    out.set(trigger.ref, already);
  }
  return out;
};

type Emitter = {
  action: string;
  ref: string;
  kind: 'row' | 'cell' | 'menu' | 'card' | 'link';
  label: string;
  props: Bag;
  where: string;
  // Per control, not merged: two verbs can be gated on the same key in opposite
  // directions, and one row cannot show both.
  gate?: { show?: string; hide?: string };
};

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

const gateOf = (spec: Bag): { show?: string; hide?: string } => ({
  ...(str(spec['showKey']) === undefined ? {} : { show: String(spec['showKey']) }),
  ...(str(spec['hideKey']) === undefined ? {} : { hide: String(spec['hideKey']) }),
});

const emittersIn = (action: string, layout: unknown, into: Emitter[] = []): Emitter[] => {
  if (Array.isArray(layout)) {
    for (const item of layout) emittersIn(action, item, into);
    return into;
  }
  if (!isBag(layout)) return into;

  const component = str(layout['component']);
  const props = isBag(layout['props']) ? (layout['props'] as Bag) : {};

  if (component === 'Rows') {
    const columns = Array.isArray(props['columns']) ? (props['columns'] as Bag[]) : [];
    const onRow = str(props['onRowRef']);
    if (onRow !== undefined) into.push({ action, ref: onRow, kind: 'row', label: '', props, where: 'Rows.onRowRef' });
    for (const column of columns) {
      const cell = isBag(column['cell']) ? (column['cell'] as Bag) : {};
      if (cell['kind'] === 'action' && str(cell['ref']) !== undefined) {
        into.push({ action, ref: String(cell['ref']), kind: 'cell', label: String(cell['label'] ?? ''), props, where: `Rows.cell(${String(cell['label'] ?? '')})`, gate: gateOf(cell) });
      }
      if (cell['kind'] === 'menu' && Array.isArray(cell['items'])) {
        for (const item of cell['items'] as Bag[]) {
          if (str(item['ref']) !== undefined) into.push({ action, ref: String(item['ref']), kind: 'menu', label: String(item['label'] ?? ''), props, where: `Rows.menu(${String(item['label'] ?? '')})`, gate: gateOf(item) });
        }
      }
    }
  }

  if (component === 'Cards' && Array.isArray(props['actions'])) {
    for (const verb of props['actions'] as Bag[]) {
      if (str(verb['ref']) !== undefined) into.push({ action, ref: String(verb['ref']), kind: 'card', label: String(verb['label'] ?? ''), props, where: `Cards.action(${String(verb['label'] ?? '')})`, gate: gateOf(verb) });
    }
  }

  if (component === 'Links' && str(layout['ref']) !== undefined) {
    into.push({ action, ref: String(layout['ref']), kind: 'link', label: '', props, where: 'Links' });
  }

  for (const value of Object.values(layout)) emittersIn(action, value, into);
  return into;
};

const keysOfSpec = (props: Bag): string[] => {
  const keys: string[] = [];
  const scan = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(scan);
    if (!isBag(value)) return;
    for (const [name, held] of Object.entries(value)) {
      if (typeof held === 'string' && held !== '' && name !== 'showKey' && name !== 'hideKey' && (name === 'key' || name.endsWith('Key'))) keys.push(held);
      scan(held);
    }
  };
  scan(props);
  return keys;
};

const rowFor = (props: Bag, paths: Set<string>, gate: { show?: string; hide?: string } = {}): Bag => {
  const row: Bag = {};
  for (const key of keysOfSpec(props)) row[key] = `${key}·seeded`;
  for (const path of paths) {
    if (path === '') continue;
    const parts = path.split('.');
    if (parts.length === 1) row[parts[0] as string] = `${parts[0]}·seeded`;
    else {
      const head = parts[0] as string;
      const nested = isBag(row[head]) ? (row[head] as Bag) : {};
      nested[parts.slice(1).join('.')] = `${path}·seeded`;
      row[head] = nested;
    }
  }
  if (gate.show !== undefined) row[gate.show] = true;
  if (gate.hide !== undefined) row[gate.hide] = false;
  return row;
};

const at = (value: unknown, path: string): unknown => {
  if (path === '') return value;
  let cursor: unknown = value;
  for (const part of path.split('.')) {
    if (!isBag(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
};

const fire = async (emitter: Emitter, row: Bag): Promise<boolean> => {
  const props = { ...emitter.props, loading: false };
  if (emitter.kind === 'link') {
    await draw('Links', { ...props, items: [{ ...row, label: 'The one item' }], loading: false }, emitter.ref);
    const item = find('.ly-row-item--clickable');
    if (item === null) return false;
    await click(item);
    return true;
  }
  if (emitter.kind === 'card') {
    await draw('Cards', { ...props, rows: [row], loading: false });
    const button = byText(emitter.label);
    if (button === null) return false;
    await click(button);
    return true;
  }
  await draw('Rows', { ...props, rows: [row], loading: false });
  if (emitter.kind === 'row') {
    const target = find('.ly-row-item--clickable');
    if (target === null) return false;
    await click(target);
    return true;
  }
  if (emitter.kind === 'cell') {
    const button = byText(emitter.label);
    if (button === null) return false;
    await click(button);
    return true;
  }
  const more = find('[aria-label="More"]');
  if (more === null) return false;
  await click(more);
  const item = byText(emitter.label);
  if (item === null) return false;
  await click(item);
  return true;
};

const catalog = Object.entries(CATALOG_DEFINITIONS);
const emitters = catalog.flatMap(([id, definition]) => emittersIn(id, definition.layout));
const readers = new Map(catalog.map(([id, definition]) => [id, readersOf(definition)] as const));

const unanswered = emitters.filter((emitter) => !(readers.get(emitter.action)?.has(emitter.ref) ?? false));
ok('every control a list draws has a trigger to answer it', unanswered.length === 0, unanswered.length === 0 ? `${emitters.length} list controls across ${catalog.length} actions` : unanswered.map((e) => `${e.action}#${e.ref} (${e.where})`).join(', '));

let checked = 0;
let fired = 0;
const broken: string[] = [];
const unreachable: string[] = [];

for (const emitter of emitters) {
  const paths = readers.get(emitter.action)?.get(emitter.ref);
  if (paths === undefined || paths.size === 0) continue;
  if (emitter.kind !== 'link' && emitter.kind !== 'card' && !Array.isArray(emitter.props['columns'])) {
    unreachable.push(`${emitter.action}#${emitter.ref}: columns are bound`);
    continue;
  }
  const row = rowFor(emitter.props, paths, emitter.gate ?? {});
  const landed = await fire(emitter, row);
  if (!landed) {
    unreachable.push(`${emitter.action}#${emitter.ref} (${emitter.where}): nothing to click`);
    continue;
  }
  fired += 1;
  const event = events.find((candidate) => candidate.ref === emitter.ref);
  if (event === undefined) {
    broken.push(`${emitter.action}#${emitter.ref}: clicking it fired ${events.length === 0 ? 'nothing' : events.map((e) => e.ref).join('/')}`);
    continue;
  }
  for (const path of paths) {
    checked += 1;
    const value = at((event as { payload?: unknown }).payload, path);
    if (value === undefined) broken.push(`${emitter.action}#${emitter.ref}: the trigger reads @event.payload${path === '' ? '' : `.${path}`}, the click sends ${JSON.stringify((event as { payload?: unknown }).payload)?.slice(0, 60)}`);
  }
}

ok('a click carries what its trigger reaches for', broken.length === 0, broken.length === 0 ? `${checked} payload paths across ${fired} controls, every one satisfied` : [...new Set(broken)].slice(0, 4).join(' · '));
ok('...and the ones this cannot reach are named', true, unreachable.length === 0 ? 'every list control was rendered and clicked' : `${unreachable.length} not driven: ${[...new Set(unreachable)].slice(0, 3).join(' · ')}`);

await draw('Rows', {
  rowKey: 'id',
  onRowRef: 'open',
  rows: [{ id: 'r1', name: 'Ada', email: 'ada@example.com' }],
  columns: [{ label: 'Name', cell: { kind: 'primary', key: 'name' } }],
});
await click('.ly-row-item--clickable');
const rowPayload = events[0]?.payload;
ok('a row click carries the ROW, not its key', isBag(rowPayload) && rowPayload['id'] === 'r1' && rowPayload['email'] === 'ada@example.com', `${JSON.stringify(rowPayload)} — every trigger reading @event.payload.<column> rests on this`);
ok('...and the rule can see the tidy-up that would break it', at({ id: 'r1', email: 'ada@example.com' }, 'email') !== undefined && at('r1', 'email') === undefined, 'sending row[rowKey] instead of the row fails the sweep above');

await draw('Switch', { label: 'Paused' }, 'toggle');
await click('[role="switch"]');
ok('a switch says which way it is going', events[0]?.payload !== undefined && (events[0]?.payload as Bag)['next'] === true, `${JSON.stringify(events[0]?.payload)} — the trigger never has to negate`);

await draw('Checkbox', { label: 'Pick' }, 'select');
await click('[role="checkbox"]');
ok('a checkbox says the same thing', (events[0]?.payload as Bag)?.['next'] === true, JSON.stringify(events[0]?.payload));

await draw('Rows', {
  rowKey: 'id',
  rows: [{ id: 'r1', name: 'Ada' }],
  selectRef: 'select',
  columns: [{ label: 'Name', cell: { kind: 'primary', key: 'name' } }],
});
const boxes = all('[role="checkbox"]');
await click(boxes[0] ?? null);
const bulk = events.at(-1)?.payload as Bag | undefined;
await click(boxes[1] ?? null);
const one = events.at(-1)?.payload as Bag | undefined;
ok('the header box selects everything and a row selects itself', bulk?.['all'] === true && one?.['id'] === 'r1' && one?.['all'] === undefined, `${JSON.stringify(bulk)} then ${JSON.stringify(one)}`);

await draw('Rows', {
  rowKey: 'id',
  rows: [{ id: 'r1', name: 'Ada' }],
  onSortRef: 'sort',
  sortKey: 'name',
  sortDir: 'asc',
  columns: [{ label: 'Name', sortable: 'name', cell: { kind: 'primary', key: 'name' } }],
});
await click('[aria-sort]');
ok('a live sort header reverses rather than re-sorts', (events[0]?.payload as Bag)?.['dir'] === 'desc' && (events[0]?.payload as Bag)?.['key'] === 'name', JSON.stringify(events[0]?.payload));

await draw('Money', { label: 'Price' }, 'price');
await focus('input');
await fill('input', '89.50');
await blur('input');
ok('money is typed in decimal and sent in cents', events.at(-1)?.payload === 8950, `typed 89.50, sent ${JSON.stringify(events.at(-1)?.payload)}`);

await draw('Money', { label: 'Price' }, 'price');
await focus('input');
await fill('input', '89,50');
await blur('input');
ok('...and a comma is a decimal point somewhere', events.at(-1)?.payload === 8950, `typed 89,50, sent ${JSON.stringify(events.at(-1)?.payload)}`);

await draw('Input', { label: 'Search', debounce: 300 }, 'search');
await focus('input');
await fill('input', 'lena');
const beforeBlur = events.length;
await blur('input');
ok('a debounced field flushes what it holds when it loses focus', events.at(-1)?.payload === 'lena', `${beforeBlur} events while typing, "${String(events.at(-1)?.payload)}" on blur`);

await draw('Input', { label: 'Search', submitRef: 'go' }, 'search');
await fill('input', 'lena');
await press('input', 'Enter');
ok('...and Enter finishes the form it is in', events.some((event) => event.ref === 'go'), events.map((event) => `${event.type}:${event.ref}`).join(' '));

await draw('Sheet', { open: true, title: 'Edit person' }, 'close');
ok('an open sheet draws over the surface', text().includes('Edit person') && find('[role="dialog"]') !== null);
await click('[aria-label="Close"]');
ok('...and its close button is the ref it was given', events[0]?.ref === 'close', JSON.stringify(events[0]));

await draw('Sheet', { open: false, title: 'Edit person' }, 'close');
ok('a closed sheet draws nothing at all', !text().includes('Edit person'), 'an empty canvas costs nothing');

report('the click path holds: every list control is answered, and every payload carries what its trigger reads.');
