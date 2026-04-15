import * as demo from './templates.demo';
import source from './templates.demo?raw';

export const story = {
  id: 'bindings-templates',
  name: 'Template interpolation',
  description:
    '`{{…}}` template interpolation inside Text children. Literal copy and `{{$.path}}` placeholders mix on the same line.',
  category: 'Bindings',
  kind: 'layout' as const,
  ...demo,
  source,
};
