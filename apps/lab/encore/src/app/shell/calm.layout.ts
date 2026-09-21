import type { LayoutNode } from '@niscorp/nova';

// `calm` — the one arrangement this slice ships. What the operator is DOING
// gets the wide left column because it is the only region with buttons in it;
// the four questions that explain it sit to the right, in reading order.
//
// COLUMNS THAT ARE NOT THERE TAKE NO ROOM. A canvas with nothing on it is served
// as an empty tree and its slot renders nothing, so a column whose canvases are
// all empty is an empty element — and the kit collapses an empty Stack. The
// columns are flex items, not grid tracks, precisely so that the ones left
// share the width: a fixed three-track grid kept a dead middle column between
// `doing` and `when` whenever nobody had asked who or where.
//
// `basis` is each column's comfortable minimum: below it the row wraps, which
// is the whole responsive story — three columns on a wall display, one in a
// narrow pane. `max` is the other end: a lone card on a wall display stays a
// card, not a banner.
//
// Later slices author `focus`, `split` and `warroom` beside this file and let
// one `choice` question pick among them. Nothing here knows that.
// THE SAME ROOM, TWICE. The app's arrangement has no headings: a card called
// "Move a set" does not need "WHAT ARE YOU DOING?" shouted over it. X-ray's has
// them — each region IS a question, and that is something about how the room
// decides, which is what x-ray is for. Swapped whole with `shell.setLayout`.
const HEADINGS: Record<string, string> = { doing: 'what are you doing?', about: 'who or what is this about?', where: 'where is it?', when: 'when is it?', nearby: 'what else matters?' };

const slot = (canvasId: string, headings: boolean): LayoutNode[] => [...(headings ? [{ component: 'Text', props: { value: HEADINGS[canvasId] ?? canvasId, variant: 'tag', tone: 'mute' } }] : []), { component: 'CanvasSlot', props: { canvasId } }];

const room = (headings: boolean): LayoutNode => ({
  component: 'Row',
  props: { gap: 18, align: 'start', wrap: true },
  children: [
    { component: 'Stack', props: { gap: 18, grow: 1.25, basis: 360, max: 860 }, children: [...slot('doing', headings)] },
    {
      component: 'Stack',
      props: { gap: 18, grow: 1, basis: 320, max: 760 },
      children: [
        ...slot('about', headings),
        ...slot('where', headings),
      ],
    },
    {
      component: 'Stack',
      props: { gap: 18, grow: 1, basis: 320, max: 760 },
      children: [
        ...slot('when', headings),
        ...slot('nearby', headings),
      ],
    },
  ],
});

export const calmLayout: LayoutNode = room(false);
export const xrayLayout: LayoutNode = room(true);
