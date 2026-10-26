import { z } from 'zod';
import { LayoutNodeSchema } from '@niscorp/nova';
import type { LayoutNode } from '@niscorp/nova';
import type { Arrangement } from '../../app/arrangements';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
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

// The areas an answer changed are marked for the kit to outline; parsed back, so what is swapped in is a layout.
export const markChanged = (layout: LayoutNode, changed: readonly AreaId[]): LayoutNode => {
  const mark = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(mark);
    if (!isRecord(node)) return node;
    const props = recordOf(node['props']);
    const marked = node['component'] === 'Area' && changed.some((area) => area === props['name']) ? { ...node, props: { ...props, changed: true } } : node;
    return 'children' in marked ? { ...marked, children: mark(marked['children']) } : marked;
  };
  return LayoutNodeSchema.parse(mark(layout));
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
