import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createStream, type StreamError, type ValidationMode } from '@niscorp/solid';
import { Pitch } from '@showroom/chrome/pitch';
import {
  DemoShell,
  ErrorPanel,
  ModeSwitcher,
  PathBadges,
  RawJsonPanel,
  StartStop,
  splitByTokens,
  type DemoState,
  type PathStatus,
} from '@showroom/modules/solid/atoms';

// Three `mode` values, three behaviours under schema violations:
//   'trust'   — no validation, the bad data flows through. Debug only.
//   'recover' — reject each bad value, keep the previous valid one,
//               emit a StreamError, keep streaming. Default.
//   'strict'  — the first violation halts the stream forever.
//
// The same payload runs against each mode — only the mode arg
// changes. Each mode dictates what `current()` will look like
// after the stream closes.

export const schema = z.object({
  title: z.string(),
  count: z.number(),
  active: z.boolean(),
  items: z.array(z.object({ id: z.number(), label: z.string() })),
  meta: z.object({ model: z.string(), tokens: z.number() }),
});

export type Value = z.infer<typeof schema>;

export const initial: Value = {
  title: 'loading…',
  count: 0,
  active: false,
  items: [],
  meta: { model: 'unknown', tokens: 0 },
};

// Five intentional hallucinations: count is a string, active is a
// string, items is an object, meta is null, and there's a bogus
// extra field the schema doesn't know about.
export const json = JSON.stringify({
  title: 'Sales Report Q4',
  count: 'seventeen',
  active: 'yes please',
  items: { woops: 'this should be an array' },
  meta: null,
  bogus: 'extra field that the schema does not know about',
});

const selectPaths = ['title', 'count', 'active', 'items', 'meta'];

const InnerDemo: FC<{ mode: ValidationMode }> = ({ mode }) => {
  const [value, setValue] = useState<Value>(initial);
  const [state, setState] = useState<DemoState>('idle');
  const [errors, setErrors] = useState<StreamError[]>([]);
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = (): void => {
    cancelRef.current?.();
    setValue(initial);
    setErrors([]);
    setPathStatuses([]);
    setState('streaming');

    const stream = createStream({ schema, initial, mode });
    stream.on(setValue);
    stream.onError((err) => {
      setErrors((prev) => [...prev, err]);
      if (mode === 'strict') setState('error');
    });

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
        setState((s) => (s === 'error' ? 'error' : 'done'));
        return;
      }
      stream.write(chunks[idx] ?? '');
      idx += 1;
      setTimeout(tick, 30);
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
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
        mode: <code style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{mode}</code>
      </div>
      <PathBadges statuses={pathStatuses} />
      <ErrorPanel errors={errors} />
      <RawJsonPanel value={value} />
    </DemoShell>
  );
};

export const Demo = () => (
  <>
    <Pitch
      headline="current() is always shape-valid — no matter what the LLM sends."
      body="This payload intentionally hallucinates: count is a string, items is an object, meta is null where a nested object is expected. In recover mode solid skips each bad value and preserves the prior one, so your UI never sees count + 1 crash or items.map fail. Strict mode halts the whole stream on first violation. Trust mode lets the mess through — included only so you can see why the invariant matters."
    />
    <ModeSwitcher>{(mode) => <InnerDemo mode={mode} />}</ModeSwitcher>
  </>
);
