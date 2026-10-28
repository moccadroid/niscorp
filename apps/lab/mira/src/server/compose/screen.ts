import { z } from 'zod';
import type { RenderNode, Shell } from '@niscorp/nova';
import { SCREENS } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import { inputKeysOf } from './catalog';
import { drawnAreas } from './layout';
import type { Plan } from './plan';
import { isRecord, recordOf } from './record';

// A card on the screen as it stands, in reading order: its title as nova drew it, the columns it takes, the action it is
// and why it is there. Its input is what it was opened with, and what the person pressed, ticked or typed into what its
// input carries; `shows` is the rest of its live data beyond what it was opened with — rows that loaded, a line being
// typed. A list there is its count and its first rows, ids left out: they are for the database, not for a person.
export type OpenCard = { area: AreaId; title: string; span: number; action: string; intent: string; input: Record<string, unknown>; shows: Record<string, unknown> };

const ROWS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const withoutIds = (row: unknown): unknown => (isRecord(row) ? Object.fromEntries(Object.entries(row).filter(([, value]) => !(typeof value === 'string' && UUID.test(value)))) : row);

const summarised = (value: unknown): unknown => (Array.isArray(value) ? { count: value.length, first: value.slice(0, ROWS).map(withoutIds) } : value);

const isEmpty = (value: unknown): boolean => value === null || value === undefined || value === '' || value === false;

const titleIn = (nodes: unknown): string | undefined => {
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes.map(recordOf)) {
    const title = recordOf(node['props'])['title'];
    if (node['name'] === 'Card' && typeof title === 'string') return title;
    const inner = titleIn(node['children']);
    if (inner !== undefined) return inner;
  }
  return undefined;
};

export const readOpenScreen = (shell: Shell, plan: Plan, drawn: NonNullable<Plan['drawn']>): OpenCard[] =>
  drawnAreas(plan).areas.flatMap(({ name: area, span }) => {
    const placed = plan.canvases[area]?.[0];
    if (placed === undefined) return [];
    const active = shell.getState().canvases[area]?.active;
    const runtime = active === undefined ? undefined : shell.getRuntime(active.id);
    const named = placed.input['title'];
    const title = typeof named === 'string' ? named : placed.action;
    // While an answer streams in, an area can hold a card the plan does not list yet; the plan's card is read as placed.
    if (runtime === undefined || runtime.definition.id !== placed.action) return [{ area, title, span, ...placed, shows: {} }];
    const data = runtime.getData();
    const opened = { ...runtime.definition.data, ...placed.input };
    const carried = inputKeysOf(runtime.definition.input);
    const moved = Object.keys(data).filter((key) => JSON.stringify(data[key]) !== JSON.stringify(opened[key]));
    const input = { ...placed.input, ...Object.fromEntries(moved.filter((key) => carried.includes(key)).map((key) => [key, data[key]])) };
    const shows = Object.fromEntries(moved.filter((key) => !carried.includes(key) && !isEmpty(data[key])).map((key) => [key, summarised(data[key])]));
    return [{ area, title: titleIn(drawn[area]) ?? title, span, action: placed.action, intent: placed.intent, input, shows }];
  });

const DockSchema = z.looseObject({
  current: z.looseObject({ label: z.string(), screen: z.string().optional(), said: z.string().optional(), position: z.number(), total: z.number(), stack: z.array(z.looseObject({ label: z.string() })) }),
  screens: z.array(z.looseObject({ label: z.string() })),
});

// What the person sees as they send a message, read off nova: the dock's chip, where the answer shown stands in the
// stack, and what was said back under the chip; the cards of the answer shown, the first screen's too; and the screens.
export type Seen = { label: string; chip: string; screen: boolean; first: boolean; position: number; total: number; stack: string[]; columns: number; cards: readonly OpenCard[]; said?: string; screens: string[] };

export const readSeen = (shell: Shell, cards: readonly OpenCard[], columns: number): Seen => {
  const active = shell.getState().canvases['dock']?.active;
  const { current, screens } = DockSchema.parse(active === undefined ? undefined : shell.getRuntime(active.id)?.getData());
  return {
    label: current.stack[current.position - 1]?.label ?? current.label,
    chip: current.label,
    screen: current.screen !== undefined,
    first: current.screen === SCREENS[0].id,
    position: current.position,
    total: current.total,
    stack: current.stack.map(({ label }) => label),
    columns,
    cards,
    ...(current.said === undefined || current.said === '' ? {} : { said: current.said }),
    screens: screens.map(({ label }) => label),
  };
};

export const canvasesStanding = (open: readonly OpenCard[]): Plan['canvases'] => Object.fromEntries(open.map(({ area, action, intent, input }) => [area, [{ action, input, intent }]]));

const cardsIn = (nodes: readonly RenderNode[]): RenderNode[] =>
  nodes.flatMap((node) => (node.type === 'component' && node.name === 'ActionSlot' ? node.children : node.type === 'fragment' ? cardsIn(node.children) : []));

// Each area's cards as nova drew them, for the overview to draw the answer by.
export const drawnCards = (shell: Shell): NonNullable<Plan['drawn']> => {
  const drawn: NonNullable<Plan['drawn']> = {};
  const walk = (nodes: readonly RenderNode[]): void => {
    for (const node of nodes) {
      const name = node.type === 'component' && node.name === 'Area' ? node.props['name'] : undefined;
      const area = AREAS.find((known) => known === name);
      if (node.type === 'component' && area !== undefined) drawn[area] = cardsIn(node.children);
      else if (node.type === 'component' || node.type === 'fragment') walk(node.children);
    }
  };
  walk(shell.flattenRenderTree(shell.getShellRenderTree()));
  return drawn;
};
