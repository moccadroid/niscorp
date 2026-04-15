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

// JSON keys arrive left-to-right. When the parser sees the next
// key start, it knows the previous one is closed — that's when
// `select(path).onFinal(cb)` fires for it. You can kick off
// follow-up work (render, dispatch, request) before the rest of
// the payload has even streamed in.
//
// The FINAL badges on the path chips above become your timing
// diagram: each latches on at a different moment, in JSON order.

export const schema = z.object({
  widget: z.object({ type: z.string(), title: z.string(), icon: z.string() }),
  response: z.string(),
  reasoning: z.string(),
  meta: z.object({ model: z.string(), tokens: z.number() }),
});

export type Value = z.infer<typeof schema>;

export const initial: Value = {
  widget: { type: '', title: '', icon: '' },
  response: '',
  reasoning: '',
  meta: { model: '', tokens: 0 },
};

export const json = JSON.stringify({
  widget: { type: 'chart', title: 'Revenue Q4', icon: 'trending-up' },
  response:
    'Q4 revenue was $4.2M, up 23% from Q3. The growth was driven primarily by enterprise subscriptions which grew 31% quarter over quarter.',
  reasoning: 'Pulled from the analytics dashboard. Compared Q3 and Q4 figures.',
  meta: { model: 'gpt-4o', tokens: 847 },
});

const selectPaths = ['widget', 'response', 'reasoning', 'meta'];

const InnerDemo: FC = () => {
  const [value, setValue] = useState<Value>(initial);
  const [state, setState] = useState<DemoState>('idle');
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = (): void => {
    cancelRef.current?.();
    setValue(initial);
    setPathStatuses([]);
    setLog([]);
    setState('streaming');

    const stream = createStream({ schema, initial });
    stream.on(setValue);

    const statuses = new Map<string, PathStatus>();
    const t0 = performance.now();
    const push = (entry: string): void => {
      setLog((prev) => [...prev, entry]);
    };

    for (const path of selectPaths) {
      const sel = stream.select(path);
      statuses.set(path, { path, value: sel.current(), isFinal: false });
      sel.on((v) => {
        statuses.set(path, { path, value: v, isFinal: false });
        setPathStatuses([...statuses.values()]);
      });
      sel.onFinal((v) => {
        const at = performance.now() - t0;
        statuses.set(path, { path, value: v, isFinal: true, finalizedAt: at });
        setPathStatuses([...statuses.values()]);
        push(`${at.toFixed(0)}ms  ·  select('${path}').onFinal()  fired`);
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

  return (
    <DemoShell>
      <StartStop state={state} onStart={start} onStop={stop} />
      <PathBadges statuses={pathStatuses} />
      {log.length > 0 && (
        <div
          style={{
            background: '#0f172a',
            color: '#bbf7d0',
            borderRadius: 6,
            padding: '12px 16px',
            fontSize: 12,
            fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
            lineHeight: 1.7,
            marginBottom: 12,
          }}
        >
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      <RawJsonPanel value={value} />
    </DemoShell>
  );
};

export const Demo = () => (
  <>
    <Pitch
      headline="React to parts, not the whole."
      body={'JSON keys are written left-to-right. When the parser sees "response" start, it knows "widget" is done. select("widget").onFinal() fires immediately. You can render the widget, dispatch an action, or start a follow-up request — all while the response is still streaming.'}
    />
    <InnerDemo />
  </>
);
