import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

export const selectApiStory: StreamDemoStory = {
  id: 'select-api',
  name: 'Independent selections',
  description: 'Four select() subscriptions — each renders independently, each finalizes at its own pace.',
  category: 'Live UI',
  kind: 'stream-demo',
  pitch: {
    headline: 'Subscribe to the parts you care about.',
    body: 'Each select() returns a stream with its own on() and onFinal(). The widget panel stops updating the moment the parser moves past it. The response panel keeps streaming. The meta panel doesn\'t even start until everything else is done. No wasted renders — each panel only re-renders when its own data changes.',
  },
  demo: {
    schema: z.object({
      header: z.object({ title: z.string(), subtitle: z.string(), badge: z.string() }),
      analysis: z.string(),
      details: z.object({
        confidence: z.number(),
        categories: z.array(z.string()),
        language: z.string(),
      }),
      meta: z.object({ model: z.string(), latency: z.string(), tokens: z.number() }),
    }),
    initial: {
      header: { title: '', subtitle: '', badge: '' },
      analysis: '',
      details: { confidence: 0, categories: [], language: '' },
      meta: { model: '', latency: '', tokens: 0 },
    },
    json: JSON.stringify({
      header: { title: 'Sentiment Analysis', subtitle: 'Customer feedback batch #2847', badge: 'positive' },
      analysis: 'The overall sentiment across the 142 feedback entries is strongly positive. Key themes include satisfaction with response time (mentioned 67 times), product quality (54 mentions), and customer support experience (38 mentions). The few negative entries primarily concern shipping delays in the EU region.',
      details: { confidence: 0.94, categories: ['customer-feedback', 'sentiment', 'batch-analysis', 'product'], language: 'en' },
      meta: { model: 'gpt-4o', latency: '1.2s', tokens: 2847 },
    }),
    chunkMode: 'token',
    delayMs: 12,
    tokensPerSecond: 80,
    selectPaths: ['header', 'analysis', 'details', 'meta'],
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({ schema, initial });

// Four independent subscriptions — each gets its own lifecycle
const header = stream.select('header');
const analysis = stream.select('analysis');
const details = stream.select('details');
const meta = stream.select('meta');

// Each panel renders only when its own data changes
header.on((h) => renderHeaderPanel(h));
analysis.on((a) => renderAnalysisPanel(a));
details.on((d) => renderDetailsPanel(d));
meta.on((m) => renderMetaPanel(m));

// Each panel locks in independently
header.onFinal(() => markPanelReady('header'));
analysis.onFinal(() => markPanelReady('analysis'));
details.onFinal(() => markPanelReady('details'));
meta.onFinal(() => markPanelReady('meta'));

// Chained selections work too
const confidence = stream.select('details').select('confidence');
// same as: stream.select('details.confidence')`,
};
