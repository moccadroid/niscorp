import { type LayoutNode, ACTION_SLOT_NAME } from '@niscorp/nova';

const chip: LayoutNode = { component: 'StackChip', props: { instances: '$.instances', canvasId: '$.id' } };

const content: LayoutNode = {
  component: 'Box',
  props: { grow: true, scroll: true, pad: 20 },
  children: { component: ACTION_SLOT_NAME, props: { instanceId: '$.active.id' } },
};

// Renders nothing when empty, so the `.rl-aside:empty` CSS rule collapses the rail.
export const asideStackLayout: LayoutNode = {
  if: '$.active',
  then: {
    component: 'Stack',
    props: { h: '100%', gap: 14 },
    children: [chip, content],
  },
  else: '',
};

export const mainStackLayout: LayoutNode = {
  component: 'Stack',
  props: { h: '100%', gap: 14 },
  children: [chip, content],
};
