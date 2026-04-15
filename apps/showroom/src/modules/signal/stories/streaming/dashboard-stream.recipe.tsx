import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import { createStream } from '@niscorp/solid';
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

type State = 'idle' | 'streaming' | 'done' | 'error';

type Props = { apiKey: string; client?: unknown };

export const Demo: FC<Props> = ({ apiKey, client }) => {
  const [value, setValue] = useState<Dashboard>(initial);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string>('');
  const controllerRef = useRef<AbortController | null>(null);

  const start = async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setValue(initial);
    setError('');
    setState('streaming');

    // Solid: creates a structural stream. `solid.on` fires whenever
    // the validated current value changes. That's the SOLE React
    // state driver — no other setState in the loop.
    const solid = createStream({ schema, initial });
    solid.on(setValue);

    // Signal: the builder chain you'd write anywhere.
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

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>
      <Controls state={state} onStart={start} onStop={stop} />
      {error !== '' && <ErrorBanner message={error} />}
      <DashboardCard value={value} streaming={state === 'streaming'} />
    </div>
  );
};

// ─── tiny local UI helpers ─────────────────────────────────

const Controls: FC<{ state: State; onStart: () => void; onStop: () => void }> = ({
  state,
  onStart,
  onStop,
}) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '0 0 16px 0' }}>
    <button
      onClick={() => void onStart()}
      disabled={state === 'streaming'}
      style={{
        padding: '8px 20px',
        borderRadius: 6,
        border: 'none',
        background: state === 'streaming' ? '#d1d5db' : '#2563eb',
        color: 'white',
        fontWeight: 600,
        fontSize: 13,
        cursor: state === 'streaming' ? 'default' : 'pointer',
      }}
    >
      {state === 'streaming' ? 'Streaming…' : state === 'done' ? 'Restart' : 'Start'}
    </button>
    {state === 'streaming' && (
      <button
        onClick={onStop}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid #fecaca',
          background: '#fef2f2',
          color: '#dc2626',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Stop
      </button>
    )}
  </div>
);

const ErrorBanner: FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      padding: '12px 16px',
      marginBottom: 16,
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderLeft: '4px solid #dc2626',
      borderRadius: 6,
      fontSize: 13,
      color: '#991b1b',
    }}
  >
    {message}
  </div>
);
