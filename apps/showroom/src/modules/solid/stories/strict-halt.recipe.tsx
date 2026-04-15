import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createStream, type StreamError, type ValidationMode } from '@niscorp/solid';
import {
  DemoShell,
  ErrorPanel,
  PathBadges,
  RawJsonPanel,
  StartStop,
  splitByTokens,
  type DemoState,
  type PathStatus,
} from './_atoms';

// `mode: 'strict'` trades resilience for certainty. The first
// violation freezes the stream at the last valid snapshot,
// `onError` fires once, and `stream.final()` rejects.
//
// Use this when a downstream consumer would commit to side
// effects it can't roll back — money movement, external RPC,
// persistent writes. "Render nothing" is safer than "render
// half of something".

export const schema = z.object({
  user: z.object({ name: z.string(), email: z.string() }),
  balance: z.number(),
  transfer: z.object({ to: z.string(), amount: z.number() }),
});

export type Value = z.infer<typeof schema>;

export const initial: Value = {
  user: { name: 'init', email: 'init@example.com' },
  balance: 1000,
  transfer: { to: '', amount: 0 },
};

// The LLM gets user + balance right. Then hallucinates the
// transfer amount as a string — strict mode halts before
// `transfer.to` is even written, and `final()` rejects.
export const json = JSON.stringify({
  user: { name: 'Alice', email: 'alice@example.com' },
  balance: 2500,
  transfer: { to: 'Bob', amount: 'nine hundred dollars' },
});

const selectPaths = ['user', 'balance', 'transfer'];

type Props = { mode?: ValidationMode };

export const Demo: FC<Props> = ({ mode = 'strict' }) => {
  const [value, setValue] = useState<Value>(initial);
  const [state, setState] = useState<DemoState>('idle');
  const [errors, setErrors] = useState<StreamError[]>([]);
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const [failed, setFailed] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = (): void => {
    cancelRef.current?.();
    setValue(initial);
    setErrors([]);
    setPathStatuses([]);
    setFailed(false);
    setState('streaming');

    const stream = createStream({ schema, initial, mode });
    stream.on(setValue);
    stream.onError((err) => {
      setErrors((prev) => [...prev, err]);
      if (mode === 'strict') setFailed(true);
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

    // The terminal contract: final() resolves with the full value
    // on success, rejects with the failure error in strict mode.
    stream
      .final()
      .then(() => setState('done'))
      .catch(() => setState('error'));

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
        return;
      }
      stream.write(chunks[idx] ?? '');
      idx += 1;
      setTimeout(tick, 50);
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
      {failed && (
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
            fontWeight: 600,
          }}
        >
          Stream failed (strict mode) — no further updates will be applied.
        </div>
      )}
      <PathBadges statuses={pathStatuses} />
      <ErrorPanel errors={errors} />
      <RawJsonPanel value={value} />
    </DemoShell>
  );
};
