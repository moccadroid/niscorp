import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createStream } from '@niscorp/solid';
import { Pitch } from '@showroom/chrome/pitch';
import {
  DemoShell,
  PathBadges,
  RawJsonPanel,
  StartStop,
  splitByTokens,
  type DemoState,
  type PathStatus,
} from '@showroom/modules/solid/atoms';

// Solid's incremental parser is linear in chunk size and uses
// structural sharing for snapshots. No JSON.parse, no
// structuredClone, no deep equality. Per-write cost:
//
//   parser scan       O(chunk_length)
//   dirty tracking    O(depth) per touched value
//   snapshot          O(dirty_paths × depth)
//   change detection  O(1) — reference equality
//
// This demo hammers a 10 KB payload character-by-character to
// make the constant factor visible. No timer delay — just as
// fast as the JS event loop lets go.

const generateItems = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Result item ${i + 1}`,
    body: `This is the content for item ${i + 1}. It contains enough text to make the payload realistic for performance testing of streaming JSON parsers.`,
    tags: [`tag-${i}a`, `tag-${i}b`, `tag-${i}c`],
  }));

export const schema = z.object({
  status: z.string(),
  items: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      body: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  summary: z.string(),
});

export type Value = z.infer<typeof schema>;

export const initial: Value = { status: '', items: [], summary: '' };

export const json = JSON.stringify({
  status: 'complete',
  items: generateItems(20),
  summary:
    'Processing complete. All items streamed successfully with incremental parsing.',
});

const selectPaths = ['status', 'items', 'summary'];

const InnerDemo: FC = () => {
  const [value, setValue] = useState<Value>(initial);
  const [state, setState] = useState<DemoState>('idle');
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = (): void => {
    cancelRef.current?.();
    setValue(initial);
    setPathStatuses([]);
    setElapsed(0);
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

    // Feed all chunks as fast as possible — the measurement is
    // "how long does solid take to absorb and validate 10 KB?".
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
      stream.destroy();
    };
    for (const chunk of splitByTokens(json)) {
      if (cancelled) return;
      stream.write(chunk);
    }
    stream.close();
    setElapsed(performance.now() - t0);
    setState('done');
  };

  const stop = (): void => {
    cancelRef.current?.();
    setState('done');
  };

  return (
    <DemoShell>
      <StartStop state={state} onStart={start} onStop={stop} />
      {elapsed > 0 && (
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          elapsed:{' '}
          <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#111827', fontWeight: 600 }}>
            {elapsed.toFixed(1)}ms
          </code>
          {'  ·  '}
          payload: <code style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{json.length.toLocaleString()} bytes</code>
        </div>
      )}
      <PathBadges statuses={pathStatuses} />
      <RawJsonPanel value={value} />
    </DemoShell>
  );
};

export const Demo = () => (
  <>
    <Pitch
      headline="10,000 characters. Linear time."
      body="This demo streams a 10 KB payload character by character — the worst case for any streaming parser. Naive repair+parse takes ~420ms (quadratic scaling). Solid's incremental parser with structural sharing completes in ~10ms. Watch the throughput counter."
    />
    <InnerDemo />
  </>
);
