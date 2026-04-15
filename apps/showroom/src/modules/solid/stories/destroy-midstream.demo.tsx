import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createStream } from '@niscorp/solid';
import { Pitch } from '../../../chrome/pitch';
import {
  DemoShell,
  PathBadges,
  RawJsonPanel,
  StartStop,
  splitByTokens,
  type DemoState,
  type PathStatus,
} from '../atoms';

// `stream.destroy()` cancels cleanly at any point:
//   - all `on()` listeners stop firing
//   - pending `final()` promises reject
//   - `select()` subscriptions detach
//   - `current()` still returns the last valid state
//
// The canonical React pattern is a useEffect cleanup. The Stop
// button here does the same thing mid-flight.

export const schema = z.object({
  status: z.string(),
  progress: z.object({ current: z.number(), total: z.number(), label: z.string() }),
  result: z.string(),
});

export type Value = z.infer<typeof schema>;

export const initial: Value = {
  status: '',
  progress: { current: 0, total: 0, label: '' },
  result: '',
};

export const json = JSON.stringify({
  status: 'processing',
  progress: { current: 142, total: 500, label: 'Analyzing customer feedback entries…' },
  result:
    'This result will never fully arrive because the stream will be destroyed mid-flight. The consumer called destroy() after getting enough data from the progress field. This is a perfectly valid pattern — you do not need to consume the entire stream.',
});

const selectPaths = ['status', 'progress', 'result'];

const InnerDemo: FC = () => {
  const [value, setValue] = useState<Value>(initial);
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
      // The core contract — destroy() at any time is safe.
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
      setTimeout(tick, 20);
    };
    tick();
  };

  const stop = (): void => {
    cancelRef.current?.();
    setState('done');
  };

  return (
    <DemoShell>
      <StartStop state={state} onStart={start} onStop={stop} />
      <PathBadges statuses={pathStatuses} />
      <RawJsonPanel value={value} />
    </DemoShell>
  );
};

export const Demo = () => (
  <>
    <Pitch
      headline="Clean cancellation, zero leaks."
      body="Call destroy() at any point and everything stops. Listeners are removed, pending final() promises reject, selected streams detach. The last valid state is preserved. Essential for component unmounting, user cancellation, or timeout handling."
    />
    <InnerDemo />
  </>
);
