import type { ActionDefinition } from '@niscorp/nova';
import { jsonviewerLayout, JSONVIEWER } from './jsonviewer.layout.js';

// The jsonviewer canvas's action: the layout over a `value` slot the mount keeps
// synced. Canvas id equals the action id (JSONVIEWER).
export const jsonviewerAction: ActionDefinition = {
  id: JSONVIEWER,
  layout: jsonviewerLayout,
  data: { value: {} },
};
