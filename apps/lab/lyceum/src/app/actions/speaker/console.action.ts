import type { ActionDefinition } from '@niscorp/nova';
import { consoleLayout } from './console.layout';

export const consoleAction: ActionDefinition = {
  id: 'speaker.console',
  title: 'Controller',
  data: {},
  layout: consoleLayout,
  triggers: [],
};
