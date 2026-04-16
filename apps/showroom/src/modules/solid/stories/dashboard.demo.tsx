import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createStream } from '@niscorp/solid';
import { Pitch } from '@showroom/chrome/pitch';
import {
  DemoShell,
  PathBadges,
  StartStop,
  splitByTokens,
  type DemoState,
  type PathStatus,
} from '@showroom/modules/solid/atoms';
import { DashboardView } from './dashboard.ui';

// A mid-size object with nested groups. The interesting bit: each
// top-level path (`metrics`, `status`, `recommendation`) finalizes
// independently. Your dashboard lights up section-by-section as
// each group closes; `stream.select('metrics').onFinal(...)` is
// the exact hook.

export const schema = z.object({
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
});

export type DashboardData = z.infer<typeof schema>;

export const initial: DashboardData = {
  title: '',
  metrics: {
    revenue: { value: '', trend: '', delta: '' },
    users: { value: '', trend: '', delta: '' },
    latency: { value: '', trend: '', delta: '' },
  },
  status: { overall: '', services: [] },
  recommendation: '',
};

export const json = JSON.stringify({
  title: 'Platform Overview — Q4 2025',
  metrics: {
    revenue: { value: '$2.4M', trend: 'up', delta: '+12%' },
    users: { value: '18,420', trend: 'up', delta: '+8%' },
    latency: { value: '142ms', trend: 'down', delta: '-23ms' },
  },
  status: {
    overall: 'healthy',
    services: [
      { name: 'API', status: 'operational' },
      { name: 'DB', status: 'operational' },
      { name: 'Cache', status: 'degraded' },
      { name: 'CDN', status: 'operational' },
    ],
  },
  recommendation:
    'Cache latency has risen 18% over the past week. Consider increasing the eviction threshold or provisioning an additional read replica before the holiday traffic peak.',
});

const selectPaths = ['title', 'metrics', 'status', 'recommendation'];

const InnerDemo: FC = () => {
  const [value, setValue] = useState<DashboardData>(initial);
  const [state, setState] = useState<DemoState>('idle');
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = (): void => {
    cancelRef.current?.();
    setValue(initial);
    setPathStatuses([]);
    setState('streaming');

    const stream = createStream({ schema, initial });
    stream.on(setValue);

    const statuses = new Map<string, PathStatus>();
    const t0 = performance.now();
    for (const path of selectPaths) {
      const sel = stream.select(path);
      statuses.set(path, { path, value: sel.current(), isFinal: false });
      sel.on((v) => {
        statuses.set(path, { path, value: v, isFinal: false });
        setPathStatuses([...statuses.values()]);
      });
      sel.onFinal((v) => {
        statuses.set(path, { path, value: v, isFinal: true, finalizedAt: performance.now() - t0 });
        setPathStatuses([...statuses.values()]);
      });
    }

    const chunks = splitByTokens(json);
    let idx = 0;
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
      stream.destroy();
    };
    const tick = (): void => {
      if (cancelled) return;
      if (idx >= chunks.length) {
        stream.close();
        setState('done');
        return;
      }
      stream.write(chunks[idx] ?? '');
      idx += 1;
      setTimeout(tick, 10);
    };
    tick();
  };

  const stop = (): void => {
    cancelRef.current?.();
    setState('done');
  };

  const pathMap = new Map(pathStatuses.map((s) => [s.path, s]));
  return (
    <DemoShell>
      <StartStop state={state} onStart={start} onStop={stop} />
      <PathBadges statuses={pathStatuses} />
      <DashboardView value={value} pathStatuses={pathMap} />
    </DemoShell>
  );
};

export const Demo = () => (
  <>
    <Pitch
      headline="Build an entire dashboard from one structured response."
      body="The LLM returns a dashboard layout with metrics, status, and recommendations. Each section renders immediately from defaults, fills in as tokens arrive, and gets a green lock icon when its data is final. The user sees a functional dashboard within milliseconds."
    />
    <InnerDemo />
  </>
);
