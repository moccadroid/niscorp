import type { ActionDefinition } from '@niscorp/nova';

// The tool for a slide that needs none: nothing on the controller's `tools`
// canvas, so it takes no room.
export const noTool: ActionDefinition = {
  id: 'tools.none',
  title: 'No tool',
  data: {},
  layout: [],
  triggers: [],
};
