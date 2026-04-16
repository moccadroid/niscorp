import { useRef, useState } from 'react';
import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import { createStream } from '@niscorp/solid';
import { Pitch } from '@showroom/chrome/pitch';
import {
  StreamShell,
  StreamControls,
  ErrorBanner,
  NoApiKey,
  type RunState,
} from '@showroom/modules/signal/atoms';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
import { DashboardCard } from './dashboard-stream.ui';

// Same signal + solid pattern as `structured-stream`, bigger
// schema. Watch the header lock in first, KPIs appear one by
// one, alerts fill, recommendations finalize last — none of
// that ordering is orchestrated by this file. It's the LLM's
// natural token order plus solid's structural invariant.
//
// The `onFinal` semantics on `solid.select(path)` let each
// subtree emit once when it's complete — useful if you want to
// trigger animations or side-effects as individual sections
// lock in. Not used here; see comments inline where hooks go.

export const provider = 'groq' as const;
export const model = 'llama-3.3-70b-versatile';
export const systemPrompt = `You are a data analyst. Respond ONLY with a JSON object matching the schema provided. No markdown, no explanation — just the JSON object.

Generate realistic data for a SaaS metrics dashboard. Include:
- header with title, subtitle, status
- exactly 4 KPIs with numeric values, units (%, $, etc), and trend (up/down/flat)
- exactly 3 alerts with severity (critical/warning/info) and message
- exactly 3 recommendations with priority (1-3), action, and impact`;

export const userInput = 'Show me the Q1 2026 SaaS metrics dashboard for our B2B platform.';

export const schema = z.object({
  header: z.object({
    title: z.string(),
    subtitle: z.string(),
    status: z.string(),
  }),
  kpis: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      unit: z.string(),
      trend: z.string(),
    }),
  ),
  alerts: z.array(z.object({ severity: z.string(), message: z.string() })),
  recommendations: z.array(
    z.object({ priority: z.number(), action: z.string(), impact: z.string() }),
  ),
});

export type Dashboard = z.infer<typeof schema>;

export const initial: Dashboard = {
  header: { title: '', subtitle: '', status: '' },
  kpis: [],
  alerts: [],
  recommendations: [],
};

// React plumbing + the signal+solid loop. Same shape as the
// smaller structured-stream demo; the wider schema just means
// more sub-sections finalize in sequence.
const useStream = () => {
  const [value, setValue] = useState<Dashboard>(initial);
  const [state, setState] = useState<RunState>('idle');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const apiKey = getKey(provider);

  const start = async (): Promise<void> => {
    if (apiKey === undefined) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setValue(initial);
    setError('');
    setState('streaming');

    const client = createOpenAIClient(provider, apiKey);
    const solid = createStream({ schema, initial });
    solid.on(setValue);

    const sig = createSignal(provider, { client })
      .apiKey(apiKey)
      .model(model)
      .systemPrompt(systemPrompt)
      .schema(schema);

    try {
      for await (const ev of sig.stream(userInput, { signal: controller.signal })) {
        if (ev.type === 'text') solid.write(ev.text);
        if (ev.type === 'done') {
          solid.close();
          setState('done');
        }
        if (ev.type === 'error') {
          solid.close();
          setError(ev.error.message);
          setState('error');
          return;
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      }
    }
  };

  const stop = (): void => {
    controllerRef.current?.abort();
    setState('done');
  };

  return { apiKey, value, state, error, start, stop };
};

export const Demo = () => {
  const { apiKey, value, state, error, start, stop } = useStream();
  if (apiKey === undefined) return <NoApiKey provider={provider} />;
  return (
    <>
      <Pitch
        headline="Watch a dashboard build itself."
        body="Four nested sections stream in left-to-right: header locks in first, then KPI cards appear one by one, alerts populate, and recommendations fill in last. Each section renders the moment its data arrives — no waiting for the full response. This is what structured streaming looks like when solid's finalization meets signal's live connection."
      />
      <StreamShell>
        <StreamControls state={state} onStart={start} onStop={stop} />
        <ErrorBanner message={error} />
        <DashboardCard value={value} streaming={state === 'streaming'} />
      </StreamShell>
    </>
  );
};
