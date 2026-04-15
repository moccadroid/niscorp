import { Demo } from './input-model.demo';
import source from './input-model.demo?raw';

export const story = {
  id: 'input-model',
  name: 'Input + model',
  description:
    '`model: "$.name"` binds an Input two-way. Keystrokes land in the data store; the greeting Text reads the same path and updates live.',
  category: 'Bindings',
  kind: 'action' as const,
  Demo,
  source,
};
