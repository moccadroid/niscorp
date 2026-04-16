import * as demo from './dashboard-stream.demo';
import source from './dashboard-stream.demo?raw';

export const story = {
  id: 'dashboard-stream',
  name: 'Live dashboard',
  description:
    'A full dashboard with KPIs, alerts, and recommendations — each section fills in as the LLM streams structured JSON.',
  category: 'Streaming',
  kind: 'stream' as const,
  ...demo,
  source,
};
