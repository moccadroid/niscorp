import * as demo from './fields.demo';
import source from './fields.demo?raw';

export const story = {
  id: 'fields',
  name: 'Fields',
  description:
    'The leaf field types — string, email, integer, enum, boolean — each mapped to its widget. Edit a field and the document updates; the Definition tab shows the ActionDefinition Loom compiled.',
  category: 'Basics',
  kind: 'basics' as const,
  ...demo,
  source,
};
