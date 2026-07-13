import type { ActionFragment } from '@niscorp/nova';

// `dock` — the chrome for a right-docked panel (Ray's assistant). The action
// provides its content; this supplies the fixed-position dock so the placement
// (not the action) owns where/how big it sits. The main screen stays visible
// beside it.
export const dockFragment: ActionFragment = {
  kind: 'fragment',
  id: 'dock',
  layout: {
    component: 'AssistantDock',
    children: { slot: 'body' },
  },
};
