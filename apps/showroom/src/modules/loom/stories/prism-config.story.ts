import * as demo from './prism-config.demo';
import source from './prism-config.demo?raw';

export const story = {
  id: 'prism-config',
  name: 'Edit a Prism config',
  description: 'Loom edits a Prism transform config; the preview runs it on a sample input and shows the output.',
  category: 'Plugins',
  kind: 'plugins' as const,
  ...demo,
  source,
};
