import * as demo from './text-stream.demo';
import source from './text-stream.demo?raw';

export const story = {
  id: 'text-stream',
  name: 'Text streaming',
  description:
    'The simplest streaming demo — tokens arrive one by one from signal.stream() and render in real time.',
  category: 'Streaming',
  kind: 'stream' as const,
  ...demo,
  source,
};
