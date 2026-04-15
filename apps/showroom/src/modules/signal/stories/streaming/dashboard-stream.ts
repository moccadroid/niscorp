import type { StreamStory } from '../../story-types';
import * as recipe from './dashboard-stream.recipe';

export const dashboardStreamStory: StreamStory = {
  id: 'dashboard-stream',
  name: 'Live dashboard',
  description:
    'A full dashboard with KPIs, alerts, and recommendations — each section fills in as the LLM streams structured JSON.',
  category: 'Streaming',
  kind: 'stream',
  pitch: {
    headline: 'Watch a dashboard build itself.',
    body: "Four nested sections stream in left-to-right: header locks in first, then KPI cards appear one by one, alerts populate, and recommendations fill in last. Each section renders the moment its data arrives — no waiting for the full response. This is what structured streaming looks like when solid's finalization meets signal's live connection.",
  },
  recipe,
};
