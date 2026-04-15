import * as demo from './ai-response.demo';
import source from './ai-response.demo?raw';

export const story = {
  id: 'ai-response',
  name: 'AI response card',
  description: 'A chat response card that builds itself as tokens stream in.',
  category: 'Live UI',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};
