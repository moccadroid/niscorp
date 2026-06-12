import * as demo from './gradient.demo';
import source from '../plugins/gradient?raw';

// The Source tab shows the plugin itself (the interesting code), not the demo.
export const story = {
  id: 'gradient',
  name: 'Gradient (example plugin)',
  description: 'A complete example plugin: it edits a gradient and previews it. The Source tab is the plugin.',
  category: 'Plugins',
  kind: 'plugins' as const,
  ...demo,
  source,
};
