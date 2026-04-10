import { type FC, useState, useRef, useCallback, useEffect } from 'react';
import { createStream } from '@niscorp/solid';
import { isStreamDemoStory, type StreamDemoStory } from '../story-types';
import { getPreview } from './previews';

// ═══════════════════════════════════════════════════════════
// StreamDemoRunner — live streaming JSON visualization
// ═══════════════════════════════════════════════════════════

type Props = { story: unknown };
type StreamState = 'idle' | 'streaming' | 'done';
type Speed = 'slow' | 'real' | 'instant';

export type PathStatus = {
  path: string;
  value: unknown;
  isFinal: boolean;
  finalizedAt?: number;
};

const SPEED_CONFIG: Record<Speed, { label: string; description: string }> = {
  slow: { label: '~50 tok/s', description: 'Slowed down — watch each token arrive' },
  real: { label: '~150 tok/s', description: 'Realistic LLM token rate' },
  instant: { label: 'Instant', description: 'Full speed — raw parser performance' },
};

export const StreamDemoRunner: FC<Props> = ({ story }) => {
  if (!isStreamDemoStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a stream demo story.</div>;
  }
  return <StreamDemo story={story} key={story.id} />;
};

const StreamDemo: FC<{ story: StreamDemoStory }> = ({ story }) => {
  const { demo, pitch } = story;
  const [state, setState] = useState<StreamState>('idle');
  const [speed, setSpeed] = useState<Speed>('real');
  const [current, setCurrent] = useState<unknown>(demo.initial);
  const [chunksSent, setChunksSent] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const [rawProgress, setRawProgress] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  const start = useCallback(() => {
    cancelRef.current?.();

    const stream = createStream({ schema: demo.schema, initial: demo.initial });
    let cancelled = false;
    let chunks = 0;
    const startTime = performance.now();

    cancelRef.current = () => {
      cancelled = true;
      stream.destroy();
    };

    // Track path statuses
    const statuses = new Map<string, PathStatus>();
    for (const path of demo.selectPaths ?? []) {
      const selected = stream.select(path);
      statuses.set(path, { path, value: selected.current(), isFinal: false });
      selected.on((value) => {
        statuses.set(path, { ...statuses.get(path)!, path, value, isFinal: false });
      });
      selected.onFinal((value) => {
        statuses.set(path, { path, value, isFinal: true, finalizedAt: performance.now() - startTime });
      });
    }

    stream.on((value) => {
      if (cancelled) return;
      setCurrent(value);
      setElapsedMs(performance.now() - startTime);
      setPathStatuses(Array.from(statuses.values()));
    });

    setState('streaming');
    setChunksSent(0);
    setRawProgress(0);

    const jsonChunks = splitChunks(demo.json, demo.chunkMode, demo.chunkSize);
    setTotalChunks(jsonChunks.length);

    // Determine delay based on speed
    // Slow: ~50 tok/s, Real: ~150 tok/s, Instant: 0
    const delayMs = speed === 'slow' ? 20
      : speed === 'real' ? 7
      : 0;

    const finish = (): void => {
      stream.close();
      setState('done');
      setElapsedMs(performance.now() - startTime);
      setPathStatuses(Array.from(statuses.values()));
    };

    if (speed === 'instant') {
      // All at once — show raw perf
      for (const chunk of jsonChunks) {
        if (chunk) stream.write(chunk);
      }
      setChunksSent(jsonChunks.length);
      setRawProgress(100);
      finish();
      return;
    }

    // Animated streaming
    let idx = 0;
    const tick = (): void => {
      if (cancelled || idx >= jsonChunks.length) {
        if (!cancelled) finish();
        return;
      }
      const chunk = jsonChunks[idx];
      if (chunk) stream.write(chunk);
      idx++;
      chunks++;
      setChunksSent(chunks);
      setRawProgress(Math.round((idx / jsonChunks.length) * 100));
      setTimeout(tick, delayMs);
    };
    tick();
  }, [demo, speed]);

  useEffect(() => () => cancelRef.current?.(), []);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>
      {pitch && <Pitch pitch={pitch} />}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0', flexWrap: 'wrap' }}>
        <button
          onClick={start}
          disabled={state === 'streaming'}
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            background: state === 'streaming' ? '#d1d5db' : '#2563eb',
            color: 'white',
            fontWeight: 600,
            fontSize: 13,
            cursor: state === 'streaming' ? 'default' : 'pointer',
          }}
        >
          {state === 'idle' ? 'Start Stream' : state === 'streaming' ? 'Streaming...' : 'Restart'}
        </button>

        <SpeedSelector speed={speed} onChange={setSpeed} disabled={state === 'streaming'} />

        <Stats
          state={state}
          tokens={chunksSent}
          totalTokens={totalChunks}
          elapsed={elapsedMs}
          progress={rawProgress}
        />
      </div>

      {/* Progress bar */}
      {state !== 'idle' && (
        <div style={{ height: 3, background: '#e5e7eb', borderRadius: 2, marginBottom: 16 }}>
          <div
            style={{
              height: '100%',
              width: `${rawProgress}%`,
              background: state === 'done' ? '#22c55e' : '#2563eb',
              borderRadius: 2,
              transition: speed === 'instant' ? 'none' : 'width 50ms',
            }}
          />
        </div>
      )}

      {/* Path status badges */}
      {pathStatuses.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {pathStatuses.map((ps) => (
            <PathBadge key={ps.path} status={ps} />
          ))}
        </div>
      )}

      {/* Live UI preview (when available) */}
      <LivePreview storyId={story.id} value={current} pathStatuses={pathStatuses} />

      {/* Raw JSON (collapsible when preview exists) */}
      <JsonPanel value={current} hasPreview={!!getPreview(story.id)} />
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────

const Pitch: FC<{ pitch: { headline: string; body: string } }> = ({ pitch }) => (
  <div
    style={{
      padding: '20px 24px',
      marginBottom: 16,
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      border: '1px solid #dbeafe',
      borderLeft: '4px solid #2563eb',
      borderRadius: 10,
    }}
  >
    <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
      Why this matters
    </div>
    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6, letterSpacing: -0.2 }}>
      {pitch.headline}
    </div>
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{pitch.body}</div>
  </div>
);

const SpeedSelector: FC<{ speed: Speed; onChange: (s: Speed) => void; disabled: boolean }> = ({ speed, onChange, disabled }) => (
  <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 6, padding: 2 }}>
    {(Object.entries(SPEED_CONFIG) as [Speed, { label: string; description: string }][]).map(([key, config]) => (
      <button
        key={key}
        onClick={() => onChange(key)}
        disabled={disabled}
        title={config.description}
        style={{
          padding: '4px 12px',
          borderRadius: 4,
          border: 'none',
          fontSize: 11,
          fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
          background: speed === key ? '#ffffff' : 'transparent',
          color: speed === key ? '#111827' : '#6b7280',
          boxShadow: speed === key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
        }}
      >
        {config.label}
      </button>
    ))}
  </div>
);

const Stats: FC<{
  state: StreamState;
  tokens: number;
  totalTokens: number;
  elapsed: number;
  progress: number;
}> = ({ state, tokens, totalTokens, elapsed, progress }) => {
  if (state === 'idle') return null;
  const actualTps = elapsed > 0 ? Math.round((tokens / elapsed) * 1000) : 0;
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280' }}>
      <span>{tokens}/{totalTokens} tokens</span>
      <span>{progress}%</span>
      <span>{elapsed.toFixed(1)}ms</span>
      {actualTps > 0 && <span>{actualTps.toLocaleString()} tok/s</span>}
    </div>
  );
};

const PathBadge: FC<{ status: PathStatus }> = ({ status }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      background: status.isFinal ? '#dcfce7' : '#fef3c7',
      color: status.isFinal ? '#166534' : '#92400e',
      border: `1px solid ${status.isFinal ? '#86efac' : '#fde68a'}`,
    }}
  >
    <span style={{
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: status.isFinal ? '#22c55e' : '#f59e0b',
    }} />
    {status.path}
    {status.isFinal && status.finalizedAt !== undefined && (
      <span style={{ fontWeight: 400, opacity: 0.7 }}>
        {status.finalizedAt.toFixed(0)}ms
      </span>
    )}
  </div>
);

// ───────────────────────────────────────────────────────────
// Live preview + JSON panel
// ───────────────────────────────────────────────────────────

const LivePreview: FC<{ storyId: string; value: unknown; pathStatuses: PathStatus[] }> = ({ storyId, value, pathStatuses }) => {
  const Preview = getPreview(storyId);
  if (!Preview) return null;

  const statusMap = new Map<string, PathStatus>();
  for (const ps of pathStatuses) statusMap.set(ps.path, ps);

  return (
    <div style={{
      padding: 20,
      background: '#f8fafc',
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      marginBottom: 12,
    }}>
      <Preview value={value} pathStatuses={statusMap} />
    </div>
  );
};

const JsonPanel: FC<{ value: unknown; hasPreview: boolean }> = ({ value, hasPreview }) => {
  const [open, setOpen] = useState(!hasPreview);

  return (
    <div>
      {hasPreview && (
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', padding: '6px 0',
            fontSize: 11, color: '#94a3b8', cursor: 'pointer', fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 9 }}>{open ? '\u25BC' : '\u25B6'}</span>
          Raw JSON
        </button>
      )}
      {open && (
        <div style={{
          background: '#1e1e1e', color: '#d4d4d4', borderRadius: 8,
          padding: 16, fontSize: 12,
          fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
          lineHeight: 1.6, overflow: 'auto', maxHeight: 400,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {JSON.stringify(value, null, 2)}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Chunk splitting
// ───────────────────────────────────────────────────────────

const splitChunks = (json: string, mode: string, chunkSize?: number): string[] => {
  switch (mode) {
    case 'char':
      return json.split('');
    case 'fixed': {
      const size = chunkSize ?? 10;
      const chunks: string[] = [];
      for (let i = 0; i < json.length; i += size) {
        chunks.push(json.slice(i, i + size));
      }
      return chunks;
    }
    case 'token':
    default: {
      const chunks: string[] = [];
      let current = '';
      for (let i = 0; i < json.length; i++) {
        const ch = json[i];
        current += ch;
        const isStructural = ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ',' || ch === ':';
        const isStringEnd = ch === '"' && i > 0 && json[i - 1] !== '\\';
        if (isStructural || isStringEnd) {
          chunks.push(current);
          current = '';
        }
      }
      if (current.length > 0) chunks.push(current);
      return chunks;
    }
  }
};
