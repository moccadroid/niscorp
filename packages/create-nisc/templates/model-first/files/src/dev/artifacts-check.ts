import { z } from 'zod';
import { ActionDefinitionSchema, LayoutNodeSchema } from '@niscorp/nova';
import type { LayoutNode } from '@niscorp/nova';
import { componentsOf, walkNodes } from '@niscorp/nova/reflect';
import { actions } from '../app/action-catalog';
import { ARRANGEMENTS } from '../app/arrangements';
import { assignments } from '../app/charter/assignments';
import { charter } from '../app/charter/charter';
import { SCREENS } from '../app/screens';
import { AREAS } from '../app/shell/areas';
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
  ...Object.values(actions).map((definition): [string, LayoutNode | undefined] => [`action "${definition.id}"`, definition.layout]),
  ...ARRANGEMENTS.map((arrangement): [string, LayoutNode | undefined] => [`arrangement "${arrangement.id}"`, arrangement.layout]),
];
for (const [name, layout] of layouts) {
  const missing = [...componentsOf(layout)].filter((component) => !registered.has(component));
  check(`${name} names only components the kit has`, missing.length === 0, missing.join(', '));
}

pure('the arrangements', ARRANGEMENTS);
const canvasesIn = (layout: unknown): string[] => {
  const held: string[] = [];
  walkNodes(layout, (node) => {
    if (node['component'] === 'CanvasSlot' && isRecord(node['props']) && typeof node['props']['canvasId'] === 'string') held.push(node['props']['canvasId']);
  });
  return held;
};
for (const arrangement of ARRANGEMENTS) {
  parses(`arrangement "${arrangement.id}"`, () => LayoutNodeSchema.parse(arrangement.layout));
  const held = canvasesIn(arrangement.layout);
  check(`arrangement "${arrangement.id}" holds only areas the shell has, each once`, held.every((name) => AREAS.some((area) => area === name)) && new Set(held).size === held.length, held.join(', '));
  check(`arrangement "${arrangement.id}" holds the ${arrangement.areaCount} it says, the first areas in order`, held.join(',') === AREAS.slice(0, arrangement.areaCount).join(','), held.join(', '));
}
check('the frame has the region an arrangement is swapped into, and the first one in it', JSON.stringify(shell.layout).includes('"ref":"answers"') && shell.layoutStore?.['answers'] !== undefined);

pure('the screens', SCREENS);
for (const screen of SCREENS) {
  for (const [at, canvas] of screen.canvases.entries()) {
    const action = actions[canvas.action];
    const named = `screen "${screen.id}" canvas ${at + 1}`;
    check(`${named} opens an action the app has`, action !== undefined, canvas.action);
    const extra = Object.keys(canvas.input).filter((key) => !inputKeysOf(action?.input).includes(key));
    check(`${named} gives only inputs ${canvas.action} takes`, extra.length === 0, extra.join(', '));
    const parsed = action?.input === undefined ? undefined : z.fromJSONSchema(action.input).safeParse(canvas.input);
    check(`${named} is opened with an input its action’s schema takes`, parsed === undefined || parsed.success, parsed?.error?.message ?? '');
    check(`${named} says why it is there`, canvas.intent.trim() !== '');
  }
  const arrangement = ARRANGEMENTS.find((candidate) => candidate.id === screen.arrangement);
  check(`screen "${screen.id}" is laid out in an arrangement there is, with room for its canvases`, arrangement !== undefined && arrangement.areaCount >= screen.canvases.length, `${screen.arrangement}: ${screen.canvases.length} canvases`);
}

finish();
