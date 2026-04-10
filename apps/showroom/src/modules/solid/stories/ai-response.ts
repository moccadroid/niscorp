import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

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
  demo: {
    schema: z.object({
      widget: z.object({
        type: z.string(),
        title: z.string(),
        icon: z.string(),
      }),
      response: z.string(),
      reasoning: z.string(),
      sources: z.array(z.object({ title: z.string(), url: z.string() })),
    }),
    initial: {
      widget: { type: '', title: '', icon: '' },
      response: '',
      reasoning: '',
      sources: [],
    },
    json: JSON.stringify({
      widget: { type: 'assistant', title: 'Research Summary', icon: 'search' },
      response: 'Based on the latest studies, regular exercise has been shown to improve cognitive function by up to 20%. A meta-analysis of 35 randomized controlled trials found consistent benefits across age groups, with the strongest effects observed in aerobic activities performed 3-5 times per week for at least 30 minutes.',
      reasoning: 'The user asked about exercise and brain health. I searched for recent meta-analyses and systematic reviews to provide evidence-based findings rather than anecdotal claims.',
      sources: [
        { title: 'Exercise and Cognition: A Meta-Analysis (2024)', url: 'https://doi.org/10.1234/neuro.2024.001' },
        { title: 'Physical Activity Guidelines for Brain Health', url: 'https://doi.org/10.1234/health.2024.042' },
      ],
    }),
    chunkMode: 'token',
    delayMs: 15,
    tokensPerSecond: 80,
    selectPaths: ['widget', 'response', 'reasoning', 'sources'],
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({ schema, initial });

// Render the card immediately — it starts valid
renderCard(stream.current());

// Update the card as fields fill in
stream.on((value) => {
  renderCard(value); // always valid, always renderable
});

// Show a checkmark when the widget header is locked in
stream.select('widget').onFinal((widget) => {
  markSectionComplete('header');
});

// Enable "Copy" button only when response is final
stream.select('response').onFinal((response) => {
  enableCopyButton(response);
});`,
};
