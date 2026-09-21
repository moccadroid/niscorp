import type { LayoutNode } from '@niscorp/nova';
import { FLOW_ORDER } from '@encore/app/canvas-placement';

// THE ROOM'S ARRANGEMENT — what the frame's `{ ref: 'room' }` resolves to. There
// is one: x-ray does not re-arrange the room, or touch it at all.
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

export const calmLayout: LayoutNode = flow;
