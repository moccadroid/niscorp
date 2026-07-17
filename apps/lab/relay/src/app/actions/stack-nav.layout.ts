import { type LayoutNode, ACTION_SLOT_NAME } from '@niscorp/nova';

// Per-canvas stack navigation — the `StackChip` (a small context chip) rendered
// by the canvas `actionLayout`, which Nova hands the whole stack via
// `{ instances, active, count }`. The chip reads `$.instances` (each instance
// carries its resolved `title`) and drives navigation by dispatching
// `nav:pop` / `nav:popTo` events — no triggers, no effects, no shell in the
// browser. It self-hides until the canvas is drilled (depth ≥ 2), so a base
// screen shows nothing.
//
// Two variants differ only in WHEN the column appears:
//   aside — only when a record is loaded (so `.rl-aside:empty` collapses it).
//   main  — always present; the chip inside decides whether to show.

const chip: LayoutNode = { component: 'StackChip', props: { instances: '$.instances' } };

// The content area — one consistent inset for every screen/record on every canvas.
const content: LayoutNode = {
  component: 'Box',
  props: { grow: true, scroll: true, pad: 20 },
  children: { component: ACTION_SLOT_NAME, props: { instanceId: '$.active.id' } },
};

// The aside (rail): renders NOTHING when empty (so the `.rl-aside:empty` rule
// collapses it), and the chip + content once a record is loaded.
export const asideStackLayout: LayoutNode = {
  if: '$.active',
  then: {
    component: 'Stack',
    props: { h: '100%', gap: 14 },
    children: [chip, content],
  },
  else: '',
};

// The main canvas: always mounted; the chip shows itself only when drilled.
export const mainStackLayout: LayoutNode = {
  component: 'Stack',
  props: { h: '100%', gap: 14 },
  children: [chip, content],
};
