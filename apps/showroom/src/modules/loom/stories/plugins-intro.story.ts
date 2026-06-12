import * as demo from './plugins-intro.demo';
import source from './plugins-intro.demo?raw';

export const story = {
  id: 'plugins-intro',
  name: 'How to build a plugin',
  description: 'A walkthrough of building the gradient plugin, from schema to a working editor.',
  category: 'Plugins',
  kind: 'plugins' as const,
  doc: true,
  ...demo,
  source,
};
