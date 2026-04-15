import type { StreamDemoStory } from '../story-types';
import * as recipe from './dashboard.recipe';

export const dashboardStory: StreamDemoStory = {
  id: 'dashboard',
  name: 'Live dashboard',
  description: 'Multiple dashboard panels assemble simultaneously, each locking in as it finalizes.',
  category: 'Live UI',
  kind: 'stream-demo',
  pitch: {
    headline: 'Build an entire dashboard from one structured response.',
    body: 'The LLM returns a dashboard layout with metrics, status, and recommendations. Each section renders immediately from defaults, fills in as tokens arrive, and gets a green lock icon when its data is final. The user sees a functional dashboard within milliseconds.',
  },
  recipe,
};
