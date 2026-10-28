import { z } from 'zod';
import type { RenderNode, Shell } from '@niscorp/nova';
import { SCREENS } from '../../app/screens';
import { inputKeysOf } from './catalog';
import type { Card, Plan } from './plan';
import { isRecord, recordOf } from './record';

// A card on the screen as it stands, in reading order: its key, its title as nova drew it, the columns it takes and the
// action it is. Its input is what it was opened with, and what the person pressed, ticked or typed into what its input
// carries; `data` is its live data as nova holds it, a list there as its count and its first rows, ids left out: they
// are for the database, not for a person.
export type OpenCard = { key: string; title: string; span: number; action: string; input: Record<string, unknown>; data: Record<string, unknown> };

const ROWS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const withoutIds = (row: unknown): unknown => (isRecord(row) ? Object.fromEntries(Object.entries(row).filter(([, value]) => !(typeof value === 'string' && UUID.test(value)))) : row);

const summarised = (value: unknown): unknown => (Array.isArray(value) ? { count: value.length, first: value.slice(0, ROWS).map(withoutIds) } : value);

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

// A title two cards share names the later ones with their number, so every card on the screen has a title of its own.
const ownTitles = (cards: readonly OpenCard[]): OpenCard[] => {
  const seen = new Map<string, number>();
  return cards.map((card) => {
    const count = (seen.get(card.title) ?? 0) + 1;
    seen.set(card.title, count);
    return count === 1 ? card : { ...card, title: `${card.title} ${String(count)}` };
  });
};

// The screen canvas holds the plan's cards in its order. While an answer streams in, a place can hold a card the plan
// does not list yet; the plan's card is read as placed.
export const readOpenScreen = (shell: Shell, plan: Plan, drawn: readonly unknown[][]): OpenCard[] => {
  const instances = shell.getState().canvases['screen']?.stack ?? [];
  return ownTitles(plan.cards.map((card, at): OpenCard => {
    const named = card.input['title'];
    const title = typeof named === 'string' ? named : card.action;
    const instance = instances[at];
    const runtime = instance === undefined ? undefined : shell.getRuntime(instance.id);
    const placed = { key: card.key, span: card.span, action: card.action };
    if (runtime === undefined || runtime.definition.id !== card.action) return { ...placed, title, input: card.input, data: card.input };
    const data = runtime.getData();
    const opened = { ...runtime.definition.data, ...card.input };
    const carried = inputKeysOf(runtime.definition.input);
    const moved = Object.keys(data).filter((key) => JSON.stringify(data[key]) !== JSON.stringify(opened[key]));
    const input = { ...card.input, ...Object.fromEntries(moved.filter((key) => carried.includes(key)).map((key) => [key, data[key]])) };
    return { ...placed, title: titleIn(drawn[at]) ?? title, input, data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, summarised(value)])) };
  }));
};

// The plan's cards with what was typed into them as they stand.
export const standingCards = (plan: Plan, open: readonly OpenCard[]): Card[] =>
  plan.cards.map((card) => {
    const seen = open.find((candidate) => candidate.key === card.key);
    return seen === undefined ? card : { ...card, input: seen.input };
  });

const DockSchema = z.looseObject({
  current: z.looseObject({ label: z.string(), screen: z.string().optional(), said: z.string().optional(), position: z.number(), total: z.number(), stack: z.array(z.looseObject({ label: z.string() })) }),
  screens: z.array(z.looseObject({ label: z.string() })),
  zone: z.string().optional(),
});

// What the person sees as they send a message, read off nova: the dock's chip, where the answer shown stands in the
// stack, and what was said back under the chip; the cards of the answer shown, the first screen's too; the screens; and
// the time zone of the device the dock is drawn on.
export type Seen = { label: string; chip: string; screen: boolean; screenId?: string; first: boolean; position: number; total: number; stack: string[]; columns: number; cards: readonly OpenCard[]; said?: string; screens: string[]; zone?: string };

export const readSeen = (shell: Shell, cards: readonly OpenCard[], columns: number): Seen => {
  const active = shell.getState().canvases['dock']?.active;
  const { current, screens, zone } = DockSchema.parse(active === undefined ? undefined : shell.getRuntime(active.id)?.getData());
  return {
    label: current.stack[current.position - 1]?.label ?? current.label,
    chip: current.label,
    screen: current.screen !== undefined,
    ...(current.screen === undefined ? {} : { screenId: current.screen }),
    first: current.screen === SCREENS[0].id,
    position: current.position,
    total: current.total,
    stack: current.stack.map(({ label }) => label),
    columns,
    cards,
    ...(current.said === undefined || current.said === '' ? {} : { said: current.said }),
    screens: screens.map(({ label }) => label),
    ...(zone === undefined || zone === '' ? {} : { zone }),
  };
};

const cardsIn = (nodes: readonly RenderNode[]): RenderNode[] =>
  nodes.flatMap((node) => (node.type === 'component' && node.name === 'ActionSlot' ? node.children : node.type === 'fragment' ? cardsIn(node.children) : []));

// Each card of the screen as nova drew it, in order, for the overview to draw the answer by.
export const drawnCards = (shell: Shell): unknown[][] => {
  const drawn: unknown[][] = [];
  const walk = (nodes: readonly RenderNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'component' && node.name === 'Area') drawn.push(cardsIn(node.children));
      else if (node.type === 'component' || node.type === 'fragment') walk(node.children);
    }
  };
  walk(shell.flattenRenderTree(shell.getCanvasRenderTree('screen')));
  return drawn;
};
