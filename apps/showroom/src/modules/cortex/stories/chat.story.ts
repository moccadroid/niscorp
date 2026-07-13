import * as demo from './chat.demo';
import source from './chat.demo?raw';

export const story = {
  id: 'chat',
  name: 'Chat (envelope)',
  description:
    'A schema-less agent returns the envelope with a required `response`. The reply streams live via output-partial (solid) while the respond tool call generates.',
  category: 'Basics',
  kind: 'basics' as const,
  ...demo,
  source,
};
