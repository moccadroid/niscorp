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
import { AIResponseCard } from './ai-response.ui';

// `createStream({ schema, initial })` gives you a value that is
// ALWAYS shape-valid — even zero-init. `stream.on(cb)` is the one
// driver of React state: you never read `current()` directly in a
// render path. `stream.select(path).onFinal(cb)` fires once per
// subtree when that field's value fully arrived; great for per-
// section FINAL badges, animations, or side-effects.
//
// In production you'd pipe an LLM stream's text events into
// `stream.write()`. Here we just tick through a pre-recorded JSON
// payload with `setTimeout` to simulate the arrival rhythm.

export const schema = z.object({
  widget: z.object({ type: z.string(), title: z.string(), icon: z.string() }),
  response: z.string(),
  reasoning: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});

export type Response = z.infer<typeof schema>;

export const initial: Response = {
  widget: { type: '', title: '', icon: '' },
  response: '',
  reasoning: '',
  sources: [],
};

export const json = JSON.stringify({
  widget: { type: 'assistant', title: 'Research Summary', icon: 'search' },
  response:
    'Based on the latest studies, regular exercise has been shown to improve cognitive function by up to 20%. A meta-analysis of 35 randomized controlled trials found consistent benefits across age groups, with the strongest effects observed in aerobic activities performed 3-5 times per week for at least 30 minutes.',
  reasoning:
    'The user asked about exercise and brain health. I searched for recent meta-analyses and systematic reviews to provide evidence-based findings rather than anecdotal claims.',
  sources: [
    { title: 'Exercise and Cognition: A Meta-Analysis (2024)', url: 'https://doi.org/10.1234/neuro.2024.001' },
    { title: 'Physical Activity Guidelines for Brain Health', url: 'https://doi.org/10.1234/health.2024.042' },
  ],
});

const selectPaths = ['widget', 'response', 'reasoning', 'sources'];

export const Demo: FC = () => {
  const [value, setValue] = useState<Response>(initial);
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

    // Per-path subscriptions — the `onFinal` callback is what the
    // FINAL badge in the card latches onto. Each select is cheap.
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

    // Chunk feeder — mimics an LLM stream arriving over ~15ms/chunk.
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
      setTimeout(tick, 15);
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
      <AIResponseCard value={value} pathStatuses={pathMap} />
    </DemoShell>
  );
};
