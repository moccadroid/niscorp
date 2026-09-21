import type { LayoutNode } from '@niscorp/nova';
import { CATEGORIES, FLOW_ORDER } from '@encore/app/canvas-placement';

// THE ROOM'S ARRANGEMENT — what the frame's `{ ref: 'room' }` resolves to, and
// what x-ray swaps whole with `shell.setLayout`.
//
// (It was three flex columns — doing | about, where | when, nearby — and a
// question nobody had asked was a column of nothing: a two-card answer used a
// third of the window. Position meant category, so category cost whitespace.)
//
// ONE PACKED FLOW, NOT COLUMNS. Every question canvas — and what the room raised
// by itself, first — renders into ONE `Pack`. A card's width is its size class
// (canvas-placement.ts `CARD_SPAN`), its meaning is its hue and tag, and its
// position is wherever the grid packs it: no region to be empty, no column to be
// dead, at any width.
const flow: LayoutNode = {
  component: 'Pack',
  children: [{ component: 'CanvasSlot', props: { canvasId: 'attention' } }, ...FLOW_ORDER.map((canvasId): LayoutNode => ({ component: 'CanvasSlot', props: { canvasId } }))],
};

// X-RAY'S LEGEND: each hue IS a question Jev is asked, and that is something about
// how the room decides — which is what x-ray is for. The app needs no legend: the
// tags are on the cards.
const legend: LayoutNode = {
  component: 'Row',
  props: { gap: 14, align: 'center', wrap: true },
  children: FLOW_ORDER.map((canvasId): LayoutNode => ({ component: 'Chip', props: { label: `${CATEGORIES[canvasId].tag} — ${CATEGORIES[canvasId].question}`, accent: CATEGORIES[canvasId].hue, done: true } })),
};

export const calmLayout: LayoutNode = flow;
export const xrayLayout: LayoutNode = { component: 'Stack', props: { gap: 10 }, children: [legend, flow] };
