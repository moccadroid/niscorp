import type { LayoutNode } from '@niscorp/nova';
import { AREAS } from './shell/areas';
import type { AreaId } from './shell/areas';

// How an answer's areas are laid out: a layout for the frame's `answers` region, and what it suits, in words — the
// words Jev and the model choose it by. `slots` is how many answers it holds; one with fewer leaves the rest out.
export type Arrangement = { id: string; suits: string; slots: number; layout: LayoutNode };

const area = (name: AreaId, span = 1): LayoutNode => ({ component: 'Area', props: { name, span }, children: [{ component: 'CanvasSlot', props: { canvasId: name } }] });
const answers = (columns: number, areas: LayoutNode[]): LayoutNode => ({ component: 'Answers', props: { columns }, children: areas });

export const ARRANGEMENTS: readonly Arrangement[] = [
  { id: 'single', suits: 'one thing, the whole width', slots: 1, layout: answers(1, [area('a')]) },
  { id: 'pair', suits: 'two things side by side, to compare them', slots: 2, layout: answers(2, [area('a'), area('b')]) },
  { id: 'hero', suits: 'one thing that matters most, the whole width, and the rest two to a row beneath it', slots: 5, layout: answers(2, [area('a', 2), area('b'), area('c'), area('d'), area('e')]) },
  { id: 'grid', suits: 'things of equal weight, two to a row', slots: AREAS.length, layout: answers(2, AREAS.map((name) => area(name))) },
  { id: 'trio', suits: 'three things of equal weight in one row', slots: 3, layout: answers(3, [area('a'), area('b'), area('c')]) },
  { id: 'strip', suits: 'everything one under the other, each the whole width, to read down', slots: AREAS.length, layout: answers(1, AREAS.map((name) => area(name))) },
];
