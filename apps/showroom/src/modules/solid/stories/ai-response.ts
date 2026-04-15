import type { StreamDemoStory } from '../story-types';
import * as recipe from './ai-response.recipe';

export const aiResponseStory: StreamDemoStory = {
  id: 'ai-response',
  name: 'AI response card',
  description: 'A chat response card that builds itself as tokens stream in.',
  category: 'Live UI',
  kind: 'stream-demo',
  pitch: {
    headline: 'Render before the data arrives.',
    body: 'The card skeleton appears instantly from the base object. As tokens stream in, the widget header fills in, the response types out character by character, and the reasoning fades in last. Every frame is a valid, renderable state.',
  },
  recipe,
};
