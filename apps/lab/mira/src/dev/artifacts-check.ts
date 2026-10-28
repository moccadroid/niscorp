import { z } from 'zod';
import { ActionDefinitionSchema, LayoutNodeSchema } from '@niscorp/nova';
import type { LayoutNode } from '@niscorp/nova';
import { componentsOf, walkNodes } from '@niscorp/nova/reflect';
import { actions } from '../app/action-catalog';
import { charter, WEARABLE } from '../app/charter/charter';
import { CARDS_ON_A_SCREEN, SCREENS } from '../app/screens';
import { shell } from '../app/shell/shell';
import { BEHAVIORS, ENTRIES } from '../app/vex';
import { inputKeysOf } from '../server/compose/catalog';
import { reconcilers } from '../server/reconcile';
import { isRecord } from '../server/compose/record';
import { ANSWER_INKS } from '../server/compose/plan';
import { INKS } from '../ui/kit';
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
pure('the role combinations people wear', WEARABLE);
pure('the reads and writes', ENTRIES);
pure('the row rules', BEHAVIORS);
pure('the shell', shell);
if (shell.layout !== undefined) parses('the shell’s frame', () => LayoutNodeSchema.parse(shell.layout));

for (const [id, definition] of Object.entries(actions)) {
  check(`action "${id}" is catalogued under its own id`, definition.id === id, `its id is "${definition.id}"`);
  parses(`action "${id}"`, () => ActionDefinitionSchema.parse(definition));
  check(`action "${id}" says what it shows`, (definition.description ?? '') !== '');
  const unknown = inputKeysOf(definition.input).filter((key) => !(key in (definition.data ?? {})));
  check(`action "${id}" declares only inputs its data has`, unknown.length === 0, unknown.join(', '));
}

const screen = shell.canvases.find((canvas) => canvas.id === 'screen');
const screenLayout = typeof screen?.actionLayout === 'object' ? screen.actionLayout : undefined;
const registered = new Set(buildRegistry().list());
const layouts: [string, LayoutNode | undefined][] = [
  ['the frame', shell.layout],
  ['the screen canvas', screenLayout],
  ...Object.values(actions).map((definition): [string, LayoutNode | undefined] => [`action "${definition.id}"`, definition.layout]),
];
for (const [name, layout] of layouts) {
  const missing = [...componentsOf(layout)].filter((component) => !registered.has(component));
  check(`${name} names only components the kit has`, missing.length === 0, missing.join(', '));
}

const canvasesIn = (layout: unknown): string[] => {
  const held: string[] = [];
  walkNodes(layout, (node) => {
    if (node['component'] === 'CanvasSlot' && isRecord(node['props']) && typeof node['props']['canvasId'] === 'string') held.push(node['props']['canvasId']);
  });
  return held;
};
check('the frame holds the screen, the overview over it and the dock, each once', canvasesIn(shell.layout).join(',') === 'screen,overview,dock', canvasesIn(shell.layout).join(', '));
check(
  'the screen is one list canvas, reconciled by a reconciler the app hands over',
  screen?.mode === 'list' && typeof screen.reconcile === 'string' && screen.reconcile in reconcilers,
  JSON.stringify({ mode: screen?.mode, reconcile: screen?.reconcile }),
);
if (screenLayout !== undefined) parses('the screen canvas’s layout', () => LayoutNodeSchema.parse(screenLayout));
check('the screen canvas is laid out as the first screen is, a card in each of its areas', JSON.stringify(screenLayout).split('"component":"ActionSlot"').length - 1 === SCREENS[0].cards.length);

pure('the screens', SCREENS);
check('every answer’s ink is one the kit has', ANSWER_INKS.every((ink) => INKS.some((known) => known === ink)), ANSWER_INKS.join(', '));
for (const screen of SCREENS) {
  for (const [at, card] of screen.cards.entries()) {
    const action = actions[card.action];
    const named = `screen "${screen.id}" card ${at + 1}`;
    check(`${named} opens an action the app has`, action !== undefined, card.action);
    const extra = Object.keys(card.input).filter((key) => !inputKeysOf(action?.input).includes(key));
    check(`${named} gives only inputs ${card.action} takes`, extra.length === 0, extra.join(', '));
    const parsed = action?.input === undefined ? undefined : z.fromJSONSchema(action.input).safeParse(card.input);
    check(`${named} is opened with an input its action’s schema takes`, parsed === undefined || parsed.success, parsed?.error?.message ?? '');
  }
  check(`screen "${screen.id}" is in an ink the kit has`, INKS.some((ink) => ink === screen.ink), screen.ink);
  check(`screen "${screen.id}" is laid out in one to three columns, with at most ${CARDS_ON_A_SCREEN} cards`, screen.columns >= 1 && screen.columns <= 3 && screen.cards.length >= 1 && screen.cards.length <= CARDS_ON_A_SCREEN, `${screen.columns} columns, ${screen.cards.length} cards`);
}

finish();
