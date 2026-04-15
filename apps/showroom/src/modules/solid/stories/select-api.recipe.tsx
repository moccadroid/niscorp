import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createStream } from '@niscorp/solid';
import {
  DemoShell,
  PathBadges,
  StartStop,
  splitByTokens,
  type DemoState,
  type PathStatus,
} from './_atoms';
import { SelectApiView } from './select-api.ui';

// `stream.select(path)` returns an independent subscription for a
// subtree — fires only when THAT path changes, finalizes when THAT
// subtree closes. Four panels here, four `select()` calls. Each
// panel updates on its own rhythm without touching the others.
//
// Useful when different UI regions render off different slices of
// the same schema and you want surgical updates (or finalization
// hooks per region) instead of a single top-level `on()`.

export const schema = z.object({
  header: z.object({ title: z.string(), subtitle: z.string(), badge: z.string() }),
  analysis: z.string(),
  details: z.object({
    confidence: z.number(),
    categories: z.array(z.string()),
    language: z.string(),
  }),
  meta: z.object({ model: z.string(), latency: z.string(), tokens: z.number() }),
});

export type SelectData = z.infer<typeof schema>;

export const initial: SelectData = {
  header: { title: '', subtitle: '', badge: '' },
  analysis: '',
  details: { confidence: 0, categories: [], language: '' },
  meta: { model: '', latency: '', tokens: 0 },
};

export const json = JSON.stringify({
  header: {
    title: 'Sentiment: Positive',
    subtitle: 'Analyzed 48 customer reviews from Q4',
    badge: 'positive',
  },
  analysis:
    'Customer sentiment shows a clear upward trend in Q4, driven primarily by improvements in delivery speed (+27% mentions) and product durability (+19%). Negative mentions cluster around packaging, which declined 12% from Q3 but still accounts for the majority of complaints.',
  details: {
    confidence: 0.89,
    categories: ['delivery', 'durability', 'packaging', 'value'],
    language: 'en',
  },
  meta: { model: 'gpt-4o', latency: '1.2s', tokens: 847 },
});

const selectPaths = ['header', 'analysis', 'details', 'meta'];

export const Demo: FC = () => {
  const [value, setValue] = useState<SelectData>(initial);
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
      setTimeout(tick, 12);
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
      <SelectApiView value={value} pathStatuses={pathMap} />
    </DemoShell>
  );
};
