import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

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
  demo: {
    schema: z.object({
      title: z.string(),
      metrics: z.object({
        revenue: z.object({ value: z.string(), trend: z.string(), delta: z.string() }),
        users: z.object({ value: z.string(), trend: z.string(), delta: z.string() }),
        latency: z.object({ value: z.string(), trend: z.string(), delta: z.string() }),
      }),
      status: z.object({
        overall: z.string(),
        services: z.array(z.object({ name: z.string(), status: z.string() })),
      }),
      recommendation: z.string(),
    }),
    initial: {
      title: '',
      metrics: {
        revenue: { value: '', trend: '', delta: '' },
        users: { value: '', trend: '', delta: '' },
        latency: { value: '', trend: '', delta: '' },
      },
      status: { overall: '', services: [] },
      recommendation: '',
    },
    json: JSON.stringify({
      title: 'Q4 Operations Dashboard',
      metrics: {
        revenue: { value: '$4.2M', trend: 'up', delta: '+23%' },
        users: { value: '84,291', trend: 'up', delta: '+12%' },
        latency: { value: '142ms', trend: 'down', delta: '-8%' },
      },
      status: {
        overall: 'healthy',
        services: [
          { name: 'API Gateway', status: 'operational' },
          { name: 'Database', status: 'operational' },
          { name: 'CDN', status: 'degraded' },
          { name: 'Auth Service', status: 'operational' },
        ],
      },
      recommendation: 'CDN latency has increased 15% over the past week. Consider scaling edge nodes in EU-West region to address growing traffic from European users.',
    }),
    chunkMode: 'token',
    delayMs: 12,
    tokensPerSecond: 80,
    selectPaths: ['title', 'metrics', 'status', 'recommendation'],
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({ schema, initial });

// Each dashboard section subscribes independently
stream.select('metrics').on((metrics) => {
  renderMetricCards(metrics);
});

stream.select('status').on((status) => {
  renderStatusPanel(status);
});

// Lock sections when finalized
stream.select('metrics').onFinal(() => markReady('metrics'));
stream.select('status').onFinal(() => markReady('status'));

stream.select('recommendation').onFinal((rec) => {
  showRecommendation(rec);
});`,
};
