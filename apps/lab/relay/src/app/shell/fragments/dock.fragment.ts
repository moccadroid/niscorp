import type { ActionFragment } from '@niscorp/nova';

export const dockFragment: ActionFragment = {
  kind: 'fragment',
  id: 'dock',
  layout: {
    component: 'AssistantDock',
    children: { slot: 'body' },
  },
};
