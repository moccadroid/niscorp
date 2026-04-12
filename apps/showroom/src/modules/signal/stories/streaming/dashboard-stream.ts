import { z } from 'zod';
import type { StreamStory } from '../../story-types';

const DashboardSchema = z.object({
  header: z.object({
    title: z.string(),
    subtitle: z.string(),
    status: z.string(),
  }),
  kpis: z.array(z.object({
    label: z.string(),
    value: z.number(),
    unit: z.string(),
    trend: z.string(),
  })),
  alerts: z.array(z.object({
    severity: z.string(),
    message: z.string(),
  })),
  recommendations: z.array(z.object({
    priority: z.number(),
    action: z.string(),
    impact: z.string(),
  })),
});

export const dashboardStreamStory: StreamStory = {
  id: 'dashboard-stream',
  name: 'Live dashboard',
  description: 'A full dashboard with KPIs, alerts, and recommendations — each section fills in as the LLM streams structured JSON.',
  category: 'Streaming',
  kind: 'stream',
  pitch: {
    headline: 'Watch a dashboard build itself.',
    body: "Four nested sections stream in left-to-right: header locks in first, then KPI cards appear one by one, alerts populate, and recommendations fill in last. Each section renders the moment its data arrives — no waiting for the full response. This is what structured streaming looks like when solid's finalization meets signal's live connection.",
  },
  setup: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: `You are a data analyst. Respond ONLY with a JSON object matching the schema provided. No markdown, no explanation — just the JSON object.

Generate realistic data for a SaaS metrics dashboard. Include:
- header with title, subtitle, status
- exactly 4 KPIs with numeric values, units (%, $, etc), and trend (up/down/flat)
- exactly 3 alerts with severity (critical/warning/info) and message
- exactly 3 recommendations with priority (1-3), action, and impact`,
    schema: DashboardSchema,
    input: 'Show me the Q1 2026 SaaS metrics dashboard for our B2B platform.',
  },
  solid: {
    schema: DashboardSchema,
    initial: {
      header: { title: '', subtitle: '', status: '' },
      kpis: [],
      alerts: [],
      recommendations: [],
    },
    selectPaths: ['header', 'kpis', 'alerts', 'recommendations'],
  },
  code: `import { createSignal } from '@niscorp/signal';
import { createStream } from '@niscorp/solid';
import { z } from 'zod';

const DashboardSchema = z.object({
  header: z.object({ title: z.string(), subtitle: z.string(), status: z.string() }),
  kpis: z.array(z.object({
    label: z.string(), value: z.number(), unit: z.string(), trend: z.string(),
  })),
  alerts: z.array(z.object({ severity: z.string(), message: z.string() })),
  recommendations: z.array(z.object({
    priority: z.number(), action: z.string(), impact: z.string(),
  })),
});

const sig = createSignal('groq')
  .model('llama-3.3-70b-versatile')
  .schema(DashboardSchema);

const solid = createStream({
  schema: DashboardSchema,
  initial: { header: { title: '', subtitle: '', status: '' }, kpis: [], alerts: [], recommendations: [] },
});

// Each section renders independently — no waiting for the full response
solid.select('header').onFinal((h) => renderHeader(h));       // fires first
solid.select('kpis').on((kpis) => renderKPICards(kpis));       // cards appear one by one
solid.select('alerts').on((alerts) => renderAlertBanner(alerts));
solid.select('recommendations').onFinal((recs) => showRecs(recs)); // fires last

for await (const ev of sig.stream('Show me the Q1 dashboard')) {
  if (ev.type === 'text') solid.write(ev.text);   // pipe deltas to solid
  if (ev.type === 'done') solid.close();           // finalize
}`,
};
