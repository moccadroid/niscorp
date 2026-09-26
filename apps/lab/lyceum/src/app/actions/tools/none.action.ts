import type { ActionDefinition } from '@niscorp/nova';

// The tool for a slide that needs none. The controller's tool region keeps its
// place either way, so it says so rather than leave a hole.
export const noTool: ActionDefinition = {
  id: 'tools.none',
  title: 'No tool',
  data: {},
  layout: {
    component: 'Sheet',
    props: { size: 'fill', areas: ['none'] },
    children: [{ component: 'Cell', props: { area: 'none', mark: 'hatch', align: 'center' }, children: [{ component: 'Label', children: 'Nothing to press on this slide' }] }],
  },
  triggers: [],
};
