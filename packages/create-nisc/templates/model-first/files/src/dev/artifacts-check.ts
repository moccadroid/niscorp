import { z } from 'zod';
import { ActionDefinitionSchema, LayoutNodeSchema } from '@niscorp/nova';
import type { LayoutNode } from '@niscorp/nova';
import { componentsOf, walkNodes } from '@niscorp/nova/reflect';
import { actions } from '../app/action-catalog';
import { assignments } from '../app/charter/assignments';
import { charter } from '../app/charter/charter';
import { SCREENS } from '../app/screens';
import { shell } from '../app/shell/shell';
import { inputKeysOf } from '../server/compose/catalog';
import { isRecord } from '../server/compose/record';
import { buildRegistry } from '../ui/registry';
import { checks } from './checks';

const { check, finish } = checks('artifacts');

const impurity = (value: unknown, path: string): string => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map((item, at) => impurity(item, `${path}[${at}]`)).find((found) => found !== '') ?? '';
  if (typeof value !== 'object') return `${path} is a ${typeof value}`;
  if (Object.getPrototypeOf(value) !== Object.prototype) return `${path} is not a plain object`;
  return Object.entries(value).map(([key, inner]) => impurity(inner, path === '' ? key : `${path}.${key}`)).find((found) => found !== '') ?? '';
};
const pure = (name: string, value: unknown): void => {
  const found = impurity(value, '');
  check(`${name} is pure JSON`, found === '', found);
};
const parses = (name: string, parse: () => unknown): void => {
  try {
    parse();
    check(`${name} parses its schema`, true);
  } catch (error) {
    check(`${name} parses its schema`, false, error instanceof Error ? error.message.slice(0, 300) : String(error));
  }
};
pure('the action catalog', actions);
pure('the charter', charter);
pure('the assignments', assignments);
pure('the shell', shell);
if (shell.layout !== undefined) parses('the shell’s frame', () => LayoutNodeSchema.parse(shell.layout));

for (const [id, definition] of Object.entries(actions)) {
  check(`action "${id}" is catalogued under its own id`, definition.id === id, `its id is "${definition.id}"`);
  parses(`action "${id}"`, () => ActionDefinitionSchema.parse(definition));
  check(`action "${id}" says what it shows`, (definition.description ?? '') !== '');
  const unknown = inputKeysOf(definition.input).filter((key) => !(key in (definition.data ?? {})));
  check(`action "${id}" declares only inputs its data has`, unknown.length === 0, unknown.join(', '));
}

const registered = new Set(buildRegistry().list());
const layouts: [string, LayoutNode | undefined][] = [
  ['the frame', shell.layout],
  ...(shell.canvases ?? []).map((canvas): [string, LayoutNode | undefined] => [`canvas "${canvas.id}"`, typeof canvas.actionLayout === 'string' ? undefined : canvas.actionLayout]),
  ...Object.values(actions).map((definition): [string, LayoutNode | undefined] => [`action "${definition.id}"`, definition.layout]),
];
for (const [name, layout] of layouts) {
  const missing = [...componentsOf(layout)].filter((component) => !registered.has(component));
  check(`${name} names only components the kit has`, missing.length === 0, missing.join(', '));
}

const slotsIn = (layout: unknown): string[] => {
  const slots: string[] = [];
  walkNodes(layout, (node) => {
    if (node['component'] === 'CanvasSlot' && isRecord(node['props']) && typeof node['props']['canvasId'] === 'string') slots.push(node['props']['canvasId']);
  });
  return slots;
};
const drawn = [...slotsIn(shell.layout), ...Object.values(actions).flatMap((definition) => slotsIn(definition.layout))];
for (const canvas of shell.canvases ?? []) check(`canvas "${canvas.id}" is drawn once: in the frame, or in an action`, drawn.filter((id) => id === canvas.id).length === 1, drawn.join(', '));

pure('the screens', SCREENS);
for (const screen of SCREENS) {
  for (const [at, card] of screen.cards.entries()) {
    const action = actions[card.action];
    const named = `screen "${screen.id}" card ${String(at + 1)}`;
    check(`${named} opens an action the app has`, action !== undefined, card.action);
    const extra = Object.keys(card.input).filter((key) => !inputKeysOf(action?.input).includes(key));
    check(`${named} gives only inputs ${card.action} takes`, extra.length === 0, extra.join(', '));
    const parsed = action?.input === undefined ? undefined : z.fromJSONSchema(action.input).safeParse(card.input);
    check(`${named} is opened with an input its action’s schema takes`, parsed === undefined || parsed.success, parsed?.error?.message ?? '');
  }
}

finish();
