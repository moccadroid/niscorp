import type { ActionDefinition } from '@niscorp/nova';
import { jsonviewerLayout, JSONVIEWER } from './jsonviewer.layout.js';

export const jsonviewerAction: ActionDefinition = {
  id: JSONVIEWER,
  layout: jsonviewerLayout,
  data: { value: {} },
};
