import * as demo from './loom-editor.demo';
import source from './loom-editor.demo?raw';

export const story = {
  id: 'loom-editor',
  name: 'Edit a Nova layout',
  description:
    'The Nova plugin in the Loom Editor: edit a Nova layout (the component tree) and its data side by side; the preview re-renders against the data. The data has no schema, so the plugin builds its editing form from the data\'s keys.',
  category: 'Plugins',
  kind: 'plugins' as const,
  ...demo,
  source,
};
