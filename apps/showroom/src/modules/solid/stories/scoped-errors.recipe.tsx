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

// `select(path).onError()` fires ONLY for errors at-or-below
// that path. Each subtree can be owned by a different component
// — the widget cares about widget-level errors, the table cares
// about table-level errors, nothing leaks. No global error bus,
// no path-filtering in your handler.
//
// This demo puts two independent violations in the payload
// (widget.icon and table.rows) and keeps a log per subtree.

export const schema = z.object({
  widget: z.object({ type: z.string(), title: z.string(), icon: z.string() }),
  table: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.number())),
  }),
  summary: z.string(),
});

export type Value = z.infer<typeof schema>;

export const initial: Value = {
  widget: { type: 'chart', title: 'loading…', icon: 'loader' },
  table: { headers: ['A', 'B'], rows: [[0, 0]] },
  summary: '',
};

// widget.icon: number instead of string
// table.rows: string instead of array
// summary:    fine
export const json = JSON.stringify({
  widget: { type: 'bar', title: 'Revenue', icon: 42 },
  table: { headers: ['Q1', 'Q2', 'Q3'], rows: 'not an array' },
  summary: 'Revenue grew 23% year over year driven by enterprise contracts.',
});

const selectPaths = ['widget', 'table', 'summary'];

type Props = { mode?: ValidationMode };

export const Demo: FC<Props> = ({ mode = 'recover' }) => {
  const [value, setValue] = useState<Value>(initial);
  const [state, setState] = useState<DemoState>('idle');
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const [widgetErrors, setWidgetErrors] = useState<StreamError[]>([]);
  const [tableErrors, setTableErrors] = useState<StreamError[]>([]);
  const [summaryErrors, setSummaryErrors] = useState<StreamError[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = (): void => {
    cancelRef.current?.();
    setValue(initial);
    setPathStatuses([]);
    setWidgetErrors([]);
    setTableErrors([]);
    setSummaryErrors([]);
    setState('streaming');

    const stream = createStream({ schema, initial, mode });
    stream.on(setValue);

    // Per-subtree error bus — the widget, table, and summary each
    // get their own isolated error channel.
    stream.select('widget').onError((err) => setWidgetErrors((prev) => [...prev, err]));
    stream.select('table').onError((err) => setTableErrors((prev) => [...prev, err]));
    stream.select('summary').onError((err) => setSummaryErrors((prev) => [...prev, err]));

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
      setTimeout(tick, 25);
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

      <SubtreeErrorGroup label="widget" errors={widgetErrors} />
      <SubtreeErrorGroup label="table" errors={tableErrors} />
      <SubtreeErrorGroup label="summary" errors={summaryErrors} />

      <RawJsonPanel value={value} />
    </DemoShell>
  );
};

const SubtreeErrorGroup: FC<{ label: string; errors: StreamError[] }> = ({ label, errors }) =>
  errors.length === 0 ? null : (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
          fontFamily: 'ui-monospace, Menlo, monospace',
        }}
      >
        select('{label}').onError — {errors.length}
      </div>
      <ErrorPanel errors={errors} />
    </div>
  );
