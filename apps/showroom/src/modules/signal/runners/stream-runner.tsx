import { type FC, useState, useRef, useCallback, useEffect } from 'react';
import { createSignal, type SignalMeta, type StreamEvent } from '@niscorp/signal';
import { createStream, type StreamError as SolidStreamError } from '@niscorp/solid';
import { isStreamStory, type StreamStory, type RecipePitch } from '../story-types';
import { getKey } from '../settings/api-key-storage';
import { createOpenAIClient } from '../openai-client';

type Props = { story: unknown };

type RunState = 'idle' | 'streaming' | 'done' | 'error';

type PathStatus = {
  path: string;
  value: unknown;
  isFinal: boolean;
};

export const StreamRunner: FC<Props> = ({ story }) => {
  if (!isStreamStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a stream story.</div>;
  }
  return <StreamDemo story={story} key={story.id} />;
};

const StreamDemo: FC<{ story: StreamStory }> = ({ story }) => {
  const { setup, pitch, solid: solidConfig } = story;
  const [state, setState] = useState<RunState>('idle');
  const [text, setText] = useState('');
  const [meta, setMeta] = useState<SignalMeta | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [retries, setRetries] = useState(0);
  const [current, setCurrent] = useState<unknown>(solidConfig?.initial ?? null);
  const [solidErrors, setSolidErrors] = useState<SolidStreamError[]>([]);
  const [pathStatuses, setPathStatuses] = useState<PathStatus[]>([]);
  const [tokenCount, setTokenCount] = useState(0);
  const cancelRef = useRef<AbortController | null>(null);
  const rawPanelRef = useRef<HTMLDivElement>(null);

  const start = useCallback(() => {
    cancelRef.current?.abort();
    const key = getKey(setup.provider);
    if (!key) {
      setErrorMsg(`No API key for ${setup.provider}. Configure in Settings.`);
      setState('error');
      return;
    }

    const controller = new AbortController();
    cancelRef.current = controller;

    setText('');
    setMeta(null);
    setErrorMsg('');
    setRetries(0);
    setCurrent(solidConfig?.initial ?? null);
    setSolidErrors([]);
    setPathStatuses([]);
    setTokenCount(0);
    setState('streaming');

    const client = createOpenAIClient(setup.provider, key);
    const base = createSignal(setup.provider, { client })
      .apiKey(key)
      .model(setup.model ?? 'llama-3.3-70b-versatile');
    const withPrompt = setup.systemPrompt ? base.systemPrompt(setup.systemPrompt) : base;
    const withSchema = setup.schema ? withPrompt.schema(setup.schema) : withPrompt;
    const withTools = setup.tools ? withSchema.tools(setup.tools) : withSchema;
    const sig = setup.options ? withTools.options(setup.options) : withTools;

    const collectedErrors: SolidStreamError[] = [];
    const statuses = new Map<string, PathStatus>();

    // Set up solid stream — exactly like the solid demo does it:
    // register .on() as the SOLE driver of React state updates.
    let solidStream: ReturnType<typeof createStream> | null = null;
    if (solidConfig) {
      solidStream = createStream({
        schema: solidConfig.schema,
        initial: solidConfig.initial,
      });

      solidStream.onError((err) => {
        collectedErrors.push(err);
        setSolidErrors([...collectedErrors]);
      });

      for (const path of solidConfig.selectPaths ?? []) {
        const sel = solidStream.select(path);
        statuses.set(path, { path, value: sel.current(), isFinal: false });
        sel.on((value) => {
          statuses.set(path, { path, value, isFinal: false });
          setPathStatuses(Array.from(statuses.values()));
        });
        sel.onFinal((value) => {
          statuses.set(path, { path, value, isFinal: true });
          setPathStatuses(Array.from(statuses.values()));
        });
      }

      solidStream.on((value) => {
        setCurrent(value);
      });
    }

    // Consume stream events. Each text event calls solid.write()
    // synchronously, which fires solid.on() synchronously, which
    // calls setCurrent(). The signal stream runs in the background;
    // solid callbacks drive the UI.
    let textBuffer = '';
    let chunks = 0;

    const iter = sig.stream(setup.input, { signal: controller.signal })[Symbol.asyncIterator]();

    const pull = (): void => {
      iter.next().then(({ done, value: ev }) => {
        if (controller.signal.aborted) {
          solidStream?.close();
          setState('done');
          return;
        }
        if (done) {
          solidStream?.close();
          setState('done');
          return;
        }

        switch (ev.type) {
          case 'text':
            textBuffer += ev.text;
            setText(textBuffer);
            solidStream?.write(ev.text);
            chunks++;
            setTokenCount(chunks);
            if (rawPanelRef.current) rawPanelRef.current.scrollTop = rawPanelRef.current.scrollHeight;
            break;
          case 'retry':
            setRetries(ev.attempt);
            textBuffer = '';
            setText('');
            if (solidConfig) {
              solidStream?.destroy();
              solidStream = createStream({ schema: solidConfig.schema, initial: solidConfig.initial });
              solidStream.on((value) => setCurrent(value));
              solidStream.onError((err) => { collectedErrors.push(err); setSolidErrors([...collectedErrors]); });
            }
            break;
          case 'done':
            solidStream?.close();
            setMeta(ev.meta);
            setState('done');
            return;
          case 'error':
            solidStream?.close();
            setErrorMsg(ev.error.message);
            setState('error');
            return;
        }

        // Schedule next pull as a macrotask — gives React + browser a paint frame.
        setTimeout(pull, 0);
      }).catch((err: unknown) => {
        solidStream?.close();
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setState('error');
      });
    };

    // Kick off the first pull
    pull();
  }, [setup, solidConfig]);

  useEffect(() => () => cancelRef.current?.abort(), []);

  const hasKey = getKey(setup.provider) !== undefined;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>
      {pitch && <Pitch pitch={pitch} />}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0', flexWrap: 'wrap' }}>
        <button
          onClick={start}
          disabled={state === 'streaming' || !hasKey}
          style={{
            padding: '8px 20px', borderRadius: 6, border: 'none',
            background: state === 'streaming' || !hasKey ? '#d1d5db' : '#2563eb',
            color: 'white', fontWeight: 600, fontSize: 13,
            cursor: state === 'streaming' || !hasKey ? 'default' : 'pointer',
          }}
        >
          {state === 'idle' ? 'Start Stream' : state === 'streaming' ? 'Streaming...' : 'Restart'}
        </button>
        {state === 'streaming' && (
          <button
            onClick={() => { cancelRef.current?.abort(); setState('done'); }}
            style={{
              padding: '8px 16px', borderRadius: 6, border: '1px solid #fecaca',
              background: '#fef2f2', color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            Abort
          </button>
        )}
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280' }}>
          <span>{tokenCount} chunks</span>
          {retries > 0 && <span style={{ color: '#d97706' }}>{retries} retry</span>}
          {meta && <span>{meta.durationMs.toFixed(0)}ms</span>}
          {meta && <span>{meta.usage.totalTokens} tokens</span>}
        </div>
      </div>

      {!hasKey && (
        <div style={{
          padding: '12px 16px', marginBottom: 16, background: '#fffbeb',
          border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b',
          borderRadius: 6, fontSize: 13, color: '#92400e',
        }}>
          No API key for <strong>{String(setup.provider)}</strong>. Configure it in Settings to run live.
        </div>
      )}

      {state === 'error' ? (
        <div style={{
          padding: '12px 16px', marginBottom: 16, background: '#fef2f2',
          border: '1px solid #fecaca', borderLeft: '4px solid #dc2626',
          borderRadius: 6, fontSize: 13, color: '#991b1b',
        }}>
          {errorMsg}
        </div>
      ) : null}

      {/* Solid live UI — above the raw stream */}
      {solidConfig !== undefined && current !== null && typeof current === 'object' && (
        <div style={{ marginBottom: 16 }}>
          {pathStatuses.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {pathStatuses.map((ps) => (
                <div key={ps.path} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                  background: ps.isFinal ? '#dcfce7' : '#fef3c7',
                  color: ps.isFinal ? '#166534' : '#92400e',
                  border: `1px solid ${ps.isFinal ? '#86efac' : '#fde68a'}`,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: ps.isFinal ? '#22c55e' : '#f59e0b',
                  }} />
                  {ps.path}
                </div>
              ))}
            </div>
          )}

          {solidErrors.length > 0 && (
            <div style={{
              marginBottom: 12, background: '#fffbeb', border: '1px solid #fde68a',
              borderLeft: '4px solid #f59e0b', borderRadius: 6, padding: '10px 14px',
              fontSize: 12, fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace', color: '#78350f',
              maxHeight: 120, overflow: 'auto',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {solidErrors.length} solid validation error{solidErrors.length === 1 ? '' : 's'}
              </div>
              {solidErrors.map((err, i) => (
                <div key={i} style={{ padding: '2px 0' }}>
                  <span style={{ color: '#b45309', fontWeight: 600 }}>[{err.phase}]</span>{' '}
                  {err.path}: expected {err.expected}, got {err.received}
                </div>
              ))}
            </div>
          )}

          <LivePreview storyId={story.id} value={current as Record<string, unknown>} streaming={state === 'streaming'} />

          <details style={{ marginTop: 12 }}>
            <summary style={{
              fontSize: 11, fontWeight: 600, color: '#94a3b8', cursor: 'pointer',
              userSelect: 'none', padding: '4px 0',
            }}>
              Raw JSON
            </summary>
            <div style={{
              background: '#1e1e1e', color: '#d4d4d4', borderRadius: 8,
              padding: 16, fontSize: 12, fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
              lineHeight: 1.6, maxHeight: 300, overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8,
            }}>
              {JSON.stringify(current, null, 2)}
            </div>
          </details>
        </div>
      )}

      {/* Raw text stream */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#6b7280',
          textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
        }}>
          {solidConfig ? 'Raw stream' : 'Response'}
        </div>
        <div
          ref={rawPanelRef}
          style={{
            background: '#1e1e1e', color: '#d4d4d4', borderRadius: 8,
            padding: 16, fontSize: 13, fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
            lineHeight: 1.6, minHeight: 80, maxHeight: solidConfig ? 200 : 500, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            border: state === 'streaming' ? '2px solid #2563eb' : '2px solid transparent',
            transition: 'border-color 200ms',
          }}
        >
          {text || (state === 'idle' ? 'Waiting...' : '')}
          {state === 'streaming' && <span style={{ color: '#6b7280' }}>▌</span>}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// LivePreview — dispatches to the right renderer by story ID
// ───────────────────────────────────────────────────────────

const LivePreview: FC<{ storyId: string; value: Record<string, unknown>; streaming: boolean }> = ({ storyId, value, streaming }) => {
  if (storyId === 'dashboard-stream') return <DashboardCard value={value} streaming={streaming} />;
  return <ResponseCard value={value} streaming={streaming} />;
};

// ───────────────────────────────────────────────────────────
// ResponseCard — widget + response + reasoning layout
// ───────────────────────────────────────────────────────────

const ResponseCard: FC<{ value: Record<string, unknown>; streaming: boolean }> = ({ value, streaming }) => {
  const widget = value['widget'] as Record<string, unknown> | undefined;
  const response = String(value['response'] ?? '');
  const reasoning = String(value['reasoning'] ?? '');
  const meta = value['meta'] as Record<string, unknown> | undefined;

  return (
    <div style={{
      background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0',
      overflow: 'hidden',
      boxShadow: streaming ? '0 0 0 2px #2563eb20' : 'none',
      transition: 'box-shadow 300ms',
    }}>
      {widget && (
        <div style={{
          padding: '16px 20px', background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
          borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {String(widget['icon'] ?? '') !== '' && (
            <div style={{
              width: 36, height: 36, borderRadius: 8, background: '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: 'white', fontWeight: 700, flexShrink: 0,
            }}>
              {String(widget['icon'] ?? '').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {String(widget['type'] || '...')}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              {String(widget['title'] || '...')}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 20px' }}>
        <div style={{
          fontSize: 14, color: '#1f2937', lineHeight: 1.7,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          minHeight: 24,
        }}>
          {response || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>Streaming response...</span>}
          {streaming && response && <span style={{ color: '#9ca3af' }}>▌</span>}
        </div>
      </div>

      {reasoning && (
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #f3f4f6',
          background: '#fafafa',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Reasoning
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {reasoning}
          </div>
        </div>
      )}

      {meta && (Number(meta['confidence']) > 0 || Number(meta['sources']) > 0) && (
        <div style={{
          padding: '10px 20px', borderTop: '1px solid #f3f4f6',
          display: 'flex', gap: 16, fontSize: 12, color: '#9ca3af',
        }}>
          {Number(meta['confidence']) > 0 && <span>Confidence: {Number(meta['confidence']).toFixed(1)}</span>}
          {Number(meta['sources']) > 0 && <span>Sources: {Number(meta['sources'])}</span>}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// DashboardCard — KPIs, alerts, recommendations
// ───────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
};

const TREND_ICON: Record<string, string> = { up: '\u2191', down: '\u2193', flat: '\u2192' };
const TREND_COLOR: Record<string, string> = { up: '#16a34a', down: '#dc2626', flat: '#6b7280' };

const DashboardCard: FC<{ value: Record<string, unknown>; streaming: boolean }> = ({ value, streaming }) => {
  const header = value['header'] as Record<string, unknown> | undefined;
  const kpis = (value['kpis'] ?? []) as Array<Record<string, unknown>>;
  const alerts = (value['alerts'] ?? []) as Array<Record<string, unknown>>;
  const recs = (value['recommendations'] ?? []) as Array<Record<string, unknown>>;

  return (
    <div style={{
      background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0',
      overflow: 'hidden',
      boxShadow: streaming ? '0 0 0 2px #2563eb20' : 'none',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        color: 'white',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {String(header?.['title'] || '...')}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
          {String(header?.['subtitle'] || '')}
        </div>
        {String(header?.['status'] || '') !== '' && (
          <span style={{
            display: 'inline-block', marginTop: 8, padding: '3px 10px',
            background: 'rgba(255,255,255,0.15)', borderRadius: 4,
            fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
          }}>
            {String(header?.['status'])}
          </span>
        )}
      </div>

      {/* KPIs */}
      {kpis.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 1, background: '#e2e8f0',
        }}>
          {kpis.map((kpi, i) => {
            const trend = String(kpi['trend'] ?? 'flat');
            return (
              <div key={i} style={{ padding: '14px 16px', background: '#ffffff' }}>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {String(kpi['label'] || '...')}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginTop: 4 }}>
                  {kpi['value'] !== undefined ? String(kpi['value']) : '...'}
                  <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 2 }}>
                    {String(kpi['unit'] || '')}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: TREND_COLOR[trend] ?? '#6b7280', marginTop: 2, fontWeight: 600 }}>
                  {TREND_ICON[trend] ?? ''} {trend}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Alerts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alerts.map((alert, i) => {
              const sev = String(alert['severity'] ?? 'info');
              const colors = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS['info']!;
              return (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: 6,
                  background: colors.bg, border: `1px solid ${colors.border}`,
                  fontSize: 13, color: colors.text,
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{sev}</span>
                  <span>{String(alert['message'] || '...')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Recommendations
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recs.map((rec, i) => (
              <div key={i} style={{
                padding: '10px 14px', borderRadius: 6,
                background: '#f8fafc', border: '1px solid #e2e8f0',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{
                  flexShrink: 0, width: 24, height: 24, borderRadius: 6,
                  background: Number(rec['priority']) === 1 ? '#dc2626' : Number(rec['priority']) === 2 ? '#f59e0b' : '#6b7280',
                  color: 'white', fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {String(rec['priority'] ?? '?')}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {String(rec['action'] || '...')}
                  </div>
                  {String(rec['impact'] || '') !== '' && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {String(rec['impact'])}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Pitch: FC<{ pitch: RecipePitch }> = ({ pitch }) => (
  <div style={{
    padding: '20px 24px', marginBottom: 16,
    background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
    border: '1px solid #dbeafe', borderLeft: '4px solid #2563eb', borderRadius: 10,
  }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
      Why this matters
    </div>
    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6, letterSpacing: -0.2 }}>
      {pitch.headline}
    </div>
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{pitch.body}</div>
  </div>
);
