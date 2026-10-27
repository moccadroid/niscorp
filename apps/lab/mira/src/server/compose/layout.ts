import { z } from 'zod';
import { LayoutNodeSchema } from '@niscorp/nova';
import type { LayoutNode } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import type { Mark, Plan, ShownPlan } from './plan';
import { isRecord, recordOf } from './record';

export const AreaIdSchema = z.enum(AREAS);

export type WrittenLayout = { layout: LayoutNode; areas: AreaId[] };

type Grid = { columns: number; areas: readonly { name: AreaId; span?: number | null | undefined }[] };

export const areasInLayout = (layout: unknown): AreaId[] => {
  if (Array.isArray(layout)) return layout.flatMap(areasInLayout);
  if (!isRecord(layout)) return [];
  const name = AreaIdSchema.safeParse(recordOf(layout['props'])['name']);
  return [...(layout['component'] === 'Area' && name.success ? [name.data] : []), ...areasInLayout(layout['children'])];
};

// "a (the whole width); b c; d e"
export const areaRows = (layout: unknown): string => {
  const node = recordOf(layout);
  const columnsProp = recordOf(node['props'])['columns'];
  const columns = typeof columnsProp === 'number' ? columnsProp : 1;
  const rows: string[][] = [[]];
  let used = 0;
  for (const area of Array.isArray(node['children']) ? node['children'] : []) {
    const props = recordOf(recordOf(area)['props']);
    const span = Math.min(typeof props['span'] === 'number' ? props['span'] : 1, columns);
    if (used + span > columns) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1]?.push(`${String(props['name'])}${span === columns && columns > 1 ? ' (the whole width)' : span > 1 ? ` (${span} columns)` : ''}`);
    used += span;
  }
  return rows.map((row) => row.join(' ')).join('; ');
};

export const areasOfArrangement = (arrangement: string | WrittenLayout, arrangements: readonly Arrangement[]): AreaId[] =>
  typeof arrangement === 'object' ? arrangement.areas : AREAS.slice(0, arrangements.find((candidate) => candidate.id === arrangement)?.areaCount ?? 0);

export const arrangementFor = (asked: string | WrittenLayout, arrangements: readonly Arrangement[]): { arrangement: string; layout: LayoutNode } => {
  if (typeof asked === 'object') return { arrangement: 'written', layout: asked.layout };
  const named = arrangements.find((arrangement) => arrangement.id === asked) ?? arrangements[0];
  return { arrangement: named?.id ?? '', layout: named?.layout ?? { component: 'Grid' } };
};

export const gridLayout = (grid: Grid): WrittenLayout => ({
  layout: {
    component: 'Grid',
    props: { columns: grid.columns },
    children: grid.areas.map(({ name, span }) => ({ component: 'Area', props: { name, span: span ?? 1 }, children: [{ component: 'CanvasSlot', props: { canvasId: name } }] })),
  },
  areas: grid.areas.map(({ name }) => name),
});

export type DrawnArea = { name: AreaId; span: number; row: number; column: number; ink: string; fresh?: Mark };

// The areas a plan fills, row by row as its grid lays them out, each with the ink of the answer that put its card there
// and what this answer did to it. A last row left short is closed by its last card taking the rest of the row.
export const drawnAreas = (plan: Plan): { columns: number; areas: DrawnArea[] } => {
  const grid = recordOf(plan.layout);
  const asked = recordOf(grid['props'])['columns'];
  const columns = typeof asked === 'number' && asked >= 1 ? asked : 1;
  const filled = (Array.isArray(grid['children']) ? grid['children'] : []).flatMap((node: unknown) => {
    const props = recordOf(recordOf(node)['props']);
    const name = AreaIdSchema.safeParse(props['name']);
    if (!name.success || plan.canvases[name.data] === undefined) return [];
    return [{ name: name.data, span: Math.min(typeof props['span'] === 'number' ? props['span'] : 1, columns) }];
  });
  let row = 1;
  let used = 0;
  const areas = filled.map(({ name, span }): DrawnArea => {
    if (used + span > columns) {
      row += 1;
      used = 0;
    }
    const column = used + 1;
    used += span;
    const fresh = plan.marks[name];
    return { name, span, row, column, ink: plan.inks[name] ?? plan.ink, ...(fresh !== undefined ? { fresh } : {}) };
  });
  const last = areas[areas.length - 1];
  return { columns, areas: last === undefined || used === columns ? areas : [...areas.slice(0, -1), { ...last, span: columns - last.column + 1 }] };
};

export const MARK_WORDS: Record<Mark, string> = { changed: 'Changed', new: 'New' };

// The frame's region as a plan is drawn: its grid, told which answer it shows, holding only the areas the plan fills,
// each saying in a word what this answer did to it.
export const drawnRegion = (plan: ShownPlan): LayoutNode => {
  const { columns, areas } = drawnAreas(plan);
  return LayoutNodeSchema.parse({
    component: 'Grid',
    props: { columns, at: plan.position },
    children: areas.map(({ name, ...props }) => ({
      component: 'Area',
      props: { name, ...props },
      children: [...(props.fresh !== undefined ? [{ component: 'Text', props: { tone: 'mark' }, children: MARK_WORDS[props.fresh] }] : []), { component: 'CanvasSlot', props: { canvasId: name } }],
    })),
  });
};

// The shell's frame with an answer's layout in its region: the frame a person's draft holds while they look at it.
export const framed = (frame: LayoutNode, region: string, layout: LayoutNode): LayoutNode => {
  const put = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(put);
    if (!isRecord(node)) return node;
    if (node['ref'] === region && Object.keys(node).length === 1) return layout;
    return 'children' in node ? { ...node, children: put(node['children']) } : node;
  };
  return LayoutNodeSchema.parse(put(frame));
};
