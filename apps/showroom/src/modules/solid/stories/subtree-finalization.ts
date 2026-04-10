import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

export const subtreeFinalizationStory: StreamDemoStory = {
  id: 'subtree-finalization',
  name: 'Subtree finalization',
  description: 'Subtrees finalize as the parser moves past them — no waiting for the full stream.',
  category: 'Finalization',
  kind: 'stream-demo',
  pitch: {
    headline: 'React to parts, not the whole.',
    body: 'JSON keys are written left-to-right. When the parser sees "response" start, it knows "widget" is done. select("widget").onFinal() fires immediately. You can render the widget, dispatch an action, or start a follow-up request — all while the response is still streaming.',
  },
  demo: {
    schema: z.object({
      widget: z.object({ type: z.string(), title: z.string(), icon: z.string() }),
      response: z.string(),
      reasoning: z.string(),
      meta: z.object({ model: z.string(), tokens: z.number() }),
    }),
    initial: {
      widget: { type: '', title: '', icon: '' },
      response: '',
      reasoning: '',
      meta: { model: '', tokens: 0 },
    },
    json: JSON.stringify({
      widget: { type: 'chart', title: 'Revenue Q4', icon: 'trending-up' },
      response: 'Q4 revenue was $4.2M, up 23% from Q3. The growth was driven primarily by enterprise subscriptions which grew 31% quarter over quarter.',
      reasoning: 'Pulled from the analytics dashboard. Compared Q3 and Q4 figures.',
      meta: { model: 'gpt-4o', tokens: 847 },
    }),
    chunkMode: 'token',
    delayMs: 10,
    tokensPerSecond: 100,
    selectPaths: ['widget', 'response', 'reasoning', 'meta'],
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({ schema, initial });

// React to individual subtrees as they finalize
stream.select('widget').onFinal((widget) => {
  // Fires as soon as the parser moves past "widget"
  // — before "response" has finished streaming
  renderCard(widget);
});

stream.select('response').onFinal((response) => {
  // Full response text, ready to display
  showAnswer(response);
});

stream.select('meta').onFinal((meta) => {
  // Last field — fires when root object closes
  logUsage(meta);
});

for await (const chunk of llmStream) {
  stream.write(chunk);
}
stream.close();`,
  expected: {
    finalizationOrder: ['widget', 'response', 'reasoning', 'meta'],
  },
};
