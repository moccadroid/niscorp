import type { ActionFragment } from '@niscorp/nova';

export const panelFragment: ActionFragment = {
  kind: 'fragment',
  id: 'panel',
  layout: {
    component: 'Overlay',
    children: {
      component: 'Dialog',
      props: { panel: true, size: '$.panelSize' },
      children: [
        { component: 'PanelClose', children: { component: 'Button', ref: 'panel-close', props: { variant: 'ghost', size: 'sm' }, children: '✕' } },
        { component: 'Box', props: { scroll: true, grow: true }, children: { slot: 'body' } },
      ],
    },
  },
  triggers: [{ event: 'ui:click', ref: 'panel-close', do: [{ pop: true }] }],
};
