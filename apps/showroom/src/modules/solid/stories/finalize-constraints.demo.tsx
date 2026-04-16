import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import {
  createStream,
  type ConstraintsMode,
  type StreamError,
  type ValidationMode,
} from '@niscorp/solid';
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

// Kind checks (string/number/array/etc.) are safe to run on every
// chunk. But `.min(5)`, `.email()`, `.regex()`, `.refine()` are
// not — a half-streamed string is legitimately too short until the
// closing quote arrives. `constraints: 'finalize'` runs the full
// sub-schema `safeParse` at the exact moment each field closes:
// partial strings never trip constraints they'll eventually pass,
// and real violations still surface with the offending path.

export const schema = z.object({
  username: z.string().min(5).max(20),
  email: z.string().email(),
  age: z.number().int().positive(),
  priority: z.enum(['low', 'medium', 'high']),
  tags: z.array(z.string().min(2)),
});

export type Value = z.infer<typeof schema>;

export const initial: Value = {
  username: 'unknown',
  email: 'unknown@example.com',
  age: 1,
  priority: 'low',
  tags: ['--'],
};

// Four constraint violations hide here — kind checks pass, only
// finalize catches them:
//   username 'al'       — too short (min 5)
//   age -3              — not positive
//   priority 'urgent'   — not in enum
//   tags ['ok', 'x']    — element too short (min 2)
export const json = JSON.stringify({
  username: 'al',
  email: 'alice@example.com',
  age: -3,
  priority: 'urgent',
  tags: ['ok', 'x'],
});

const selectPaths = ['username', 'email', 'age', 'priority', 'tags'];

const CONSTRAINTS: ConstraintsMode = 'finalize';

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

    const stream = createStream({ schema, initial, mode, constraints: CONSTRAINTS });
    stream.on(setValue);
    stream.onError((err) => setErrors((prev) => [...prev, err]));

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
      setTimeout(tick, 40);
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
        {'  ·  '}
        constraints: <code style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{CONSTRAINTS}</code>
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
      headline="Schema constraints, enforced at the right moment."
      body='Kind checks alone catch "array where string expected". But what about `email()` or `min(10)`? You cannot check those on a half-streamed string — the field is legitimately too short until the closing quote arrives. Setting constraints: "finalize" runs the sub-schema at the exact moment each field closes, so partial strings never trip constraints they will eventually satisfy.'
    />
    <ModeSwitcher>{(mode) => <InnerDemo mode={mode} />}</ModeSwitcher>
  </>
);
