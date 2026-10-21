import type { LayoutNode } from '@niscorp/nova';
import { ARRANGEMENTS } from '../../app/arrangements';
import type { Arrangement } from '../../app/arrangements';
import type { Canvas } from '../../app/screens';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';

// What a message, or a screen opened from the menu, was answered with: the canvas of each area, in an array as nova's
// `reconcile` takes it; what the model said it did (`reasoning`); where it stands among the answers given, and what they
// all were (`stack`).
export type Plan = {
  question: string;
  reasoning?: string;
  label: string;
  screen?: string;
  position: number;
  total: number;
  stack: { position: number; label: string }[];
  canvases: Partial<Record<AreaId, Canvas[]>>;
  arrangement: string;
  layout: LayoutNode;
};

export type Unnumbered = Omit<Plan, 'position' | 'total' | 'stack'>;

export type Placed = Partial<Record<AreaId, Canvas>>;

export type Said = { title: string; text: string };

// A layout the model wrote, and the areas it holds.
export type Written = { layout: LayoutNode; areas: AreaId[] };

export const textOf = (said: Said, examples: readonly string[]): Canvas => ({ action: 'answer.text', input: { title: said.title, text: said.text, examples: [...examples] }, intent: `the words "${said.title}"` });

// A screen's canvases, an area each, in order.
export const areasOf = (canvases: readonly Canvas[]): Placed => Object.fromEntries(canvases.slice(0, AREAS.length).map((canvas, at) => [AREAS[at], canvas]));

// The areas a layout holds, in the order it draws them.
export const areasIn = (layout: unknown): AreaId[] => {
  if (Array.isArray(layout)) return layout.flatMap(areasIn);
  if (layout === null || typeof layout !== 'object') return [];
  const node = layout as Record<string, unknown>;
  const props = node['props'] as Record<string, unknown> | undefined;
  const own = node['component'] === 'Area' && (AREAS as readonly unknown[]).includes(props?.['name']) ? [props?.['name'] as AreaId] : [];
  return [...own, ...areasIn(node['children'])];
};

// Where a layout puts its areas, row by row: "a (the whole width); b c; d e".
const recordOf = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export const whereOf = (layout: unknown): string => {
  const node = recordOf(layout);
  const props = recordOf(node['props']);
  const columns = typeof props['columns'] === 'number' ? props['columns'] : 1;
  const rows: string[][] = [[]];
  let used = 0;
  for (const area of Array.isArray(node['children']) ? node['children'] : []) {
    const own = recordOf(recordOf(area)['props']);
    const span = Math.min(typeof own['span'] === 'number' ? own['span'] : 1, columns);
    if (used + span > columns) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1]?.push(`${String(own['name'])}${span === columns && columns > 1 ? ' (the whole width)' : span > 1 ? ` (${span} columns)` : ''}`);
    used += span;
  }
  return rows.map((row) => row.join(' ')).join('; ');
};

const used = (placed: Placed): number => AREAS.reduce((last, area, at) => (placed[area] !== undefined ? at + 1 : last), 0);

// The arrangement asked for — by name, or written — else the one the plan had, when it holds every area used; else the
// smallest one that does.
const laidOut = (asked: string | Written | undefined, count: number): { arrangement: string; layout: LayoutNode } => {
  if (typeof asked === 'object') return { arrangement: 'written', layout: asked.layout };
  const named = ARRANGEMENTS.find((arrangement) => arrangement.id === asked && arrangement.slots >= count);
  const fits = named ?? [...ARRANGEMENTS].filter((arrangement) => arrangement.slots >= count).sort((one, other) => one.slots - other.slots)[0] ?? ARRANGEMENTS[ARRANGEMENTS.length - 1];
  return { arrangement: fits?.id ?? '', layout: fits?.layout ?? { component: 'Answers' } };
};

// The areas an arrangement holds: a named one its first, a written one those it draws.
export const areasOfArrangement = (arrangement: string | Written, arrangements: readonly Arrangement[] = ARRANGEMENTS): AreaId[] =>
  typeof arrangement === 'object' ? arrangement.areas : AREAS.slice(0, arrangements.find((candidate) => candidate.id === arrangement)?.slots ?? 0);

// A plan for a message is named by it, and one for a screen by the screen's label.
export const planOf = (question: string, placed: Placed, how: { screen?: { id: string; label: string }; arrangement?: string | Written } = {}): Unnumbered => ({
  question,
  label: how.screen?.label ?? question,
  ...(how.screen !== undefined ? { screen: how.screen.id } : {}),
  canvases: Object.fromEntries(AREAS.flatMap((area) => (placed[area] !== undefined ? [[area, [placed[area]]]] : []))),
  ...laidOut(how.arrangement, used(placed)),
});

// A layout with these areas marked as changed by the answer, for the kit to outline.
export const markedLayout = (layout: LayoutNode, changed: readonly AreaId[]): LayoutNode => {
  const mark = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(mark);
    const own = recordOf(node);
    if (Object.keys(own).length === 0) return node;
    const props = recordOf(own['props']);
    const marked = own['component'] === 'Area' && (changed as readonly unknown[]).includes(props['name']) ? { ...own, props: { ...props, changed: true } } : own;
    return 'children' in marked ? { ...marked, children: mark(marked['children']) } : marked;
  };
  return mark(layout) as LayoutNode;
};

// The areas of a plan whose canvas is not the one another plan had there.
export const changedAreas = (now: Unnumbered, before: Unnumbered): AreaId[] =>
  AREAS.filter((area) => now.canvases[area] !== undefined && JSON.stringify(now.canvases[area]) !== JSON.stringify(before.canvases[area]));

// What a plan holds, an area each.
export const placedOf = (plan: Unnumbered): Placed => Object.fromEntries(AREAS.flatMap((area) => (plan.canvases[area]?.[0] !== undefined ? [[area, plan.canvases[area]?.[0]]] : [])));
