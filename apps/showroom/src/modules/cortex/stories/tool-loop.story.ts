import * as demo from './tool-loop.demo';
import source from './tool-loop.demo?raw';

export const story = {
  id: 'tool-loop',
  name: 'The tool loop',
  description:
    'model → tool → model → respond, in one always-streaming loop. tool-start fires before execution; tool-end carries a typed observation; the typed exit is the respond call.',
  category: 'The loop',
  kind: 'loop' as const,
  ...demo,
  source,
};
