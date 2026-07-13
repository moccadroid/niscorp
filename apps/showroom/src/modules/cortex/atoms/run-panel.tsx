import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ApprovalRequest, CortexEvent, RunHandle, RunResult, SignalClient } from '@niscorp/cortex';
import { buildLlm, KEY_HINT } from '../llm';

// ═══════════════════════════════════════════════════════════
// RunPanel — the shared engine behind every cortex demo.
//
// A demo supplies makeRun (build a RunHandle from llm + input +
// onEvent); the panel renders the input, the live event timeline,
// the streamed partial envelope (solid-powered output-partial),
// pending approvals with approve/deny buttons, and the final
// result + runtime-authored meta.
// ═══════════════════════════════════════════════════════════

export type MakeRun = (
  llm: SignalClient,
  input: string,
  onEvent: (event: CortexEvent) => void,
) => RunHandle<unknown>;

export type RunPanelProps = {
  makeRun: MakeRun;
  initialInput: string;
  inputRows?: number;
  hint?: string;
};

type TimelineLine = { key: number; text: string; tone: 'plain' | 'ok' | 'bad' };

const mono: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 12 };
const panel: CSSProperties = {
  border: '1px solid var(--border, #ddd)',
  borderRadius: 8,
  padding: 12,
  minHeight: 120,
  overflow: 'auto',
};
const label: CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6, marginBottom: 6 };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const pathPrefix = (event: CortexEvent): string =>
  event.agentPath.length > 1 ? `[${event.agentPath.join(' › ')}] ` : '';

const toLine = (event: CortexEvent, key: number): TimelineLine | undefined => {
  const prefix = pathPrefix(event);
  switch (event.type) {
    case 'run-start':
      return { key, text: `${prefix}run-start`, tone: 'plain' };
    case 'step-start':
      return { key, text: `${prefix}step ${event.step}`, tone: 'plain' };
    case 'tool-start':
      return { key, text: `${prefix}→ ${event.call.toolId} ${JSON.stringify(event.call.args)}`, tone: 'plain' };
    case 'tool-end': {
      const o = event.observation;
      if (o.kind === 'result') return { key, text: `${prefix}✓ ${o.toolId} (${o.durationMs}ms)`, tone: 'ok' };
      if (o.kind === 'denied') return { key, text: `${prefix}✗ ${o.toolId} denied: ${o.reason}`, tone: 'bad' };
      if (o.kind === 'error') return { key, text: `${prefix}✗ ${o.toolId} ${o.error}`, tone: 'bad' };
      return { key, text: `${prefix}✗ unknown tool ${o.toolId}`, tone: 'bad' };
    }
    case 'approval-required':
      return { key, text: `${prefix}⏸ approval required: ${event.approval.toolId}`, tone: 'plain' };
    case 'retry':
      return { key, text: `${prefix}↻ retry(${event.kind}): ${event.issues}`, tone: 'bad' };
    case 'run-end':
      return { key, text: `${prefix}run-end`, tone: 'plain' };
    default:
      return undefined; // model-delta / output-delta / output-partial render elsewhere
  }
};

const PartialView = ({ partial }: { partial: unknown }): ReactNode => {
  if (!isRecord(partial)) return null;
  const response = typeof partial['response'] === 'string' ? partial['response'] : undefined;
  const data = partial['data'];
  return (
    <>
      {response !== undefined && <div style={{ whiteSpace: 'pre-wrap' }}>{response}</div>}
      {data !== undefined && (
        <pre style={{ ...mono, margin: response !== undefined ? '8px 0 0' : 0 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </>
  );
};

const ResultView = ({ result }: { result: RunResult<unknown> }): ReactNode => {
  const meta = `${result.meta.strategy} · ${result.meta.steps} step(s) · ${result.meta.outputRetries} retr${result.meta.outputRetries === 1 ? 'y' : 'ies'} · ${result.meta.usage.totalTokens} tok · ${result.meta.elapsedMs}ms`;
  if (!result.ok) {
    return (
      <>
        <div style={{ color: 'crimson' }}>
          {result.error.code}: {result.error.message}
        </div>
        <div style={{ ...mono, opacity: 0.6, marginTop: 8 }}>{meta}</div>
      </>
    );
  }
  return (
    <>
      <PartialView partial={result.output} />
      {result.output.reasoning !== undefined && (
        <div style={{ opacity: 0.7, fontStyle: 'italic', marginTop: 8 }}>why: {result.output.reasoning}</div>
      )}
      <div style={{ ...mono, opacity: 0.6, marginTop: 8 }}>{meta}</div>
    </>
  );
};

export const RunPanel = ({ makeRun, initialInput, inputRows = 2, hint }: RunPanelProps) => {
  const [input, setInput] = useState(initialInput);
  const [lines, setLines] = useState<TimelineLine[]>([]);
  const [partial, setPartial] = useState<unknown>(undefined);
  const [result, setResult] = useState<RunResult<unknown> | undefined>(undefined);
  const [pending, setPending] = useState<ApprovalRequest | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const handleRef = useRef<RunHandle<unknown> | undefined>(undefined);
  const lineKey = useRef(0);

  const onEvent = (event: CortexEvent): void => {
    if (event.type === 'output-partial') {
      setPartial(event.output);
      return;
    }
    if (event.type === 'retry') setPartial(undefined);
    if (event.type === 'approval-required' && event.agentPath.length === 1) setPending(event.approval);
    lineKey.current += 1;
    const line = toLine(event, lineKey.current);
    if (line) setLines((previous) => [...previous, line]);
  };

  const run = async (): Promise<void> => {
    const llm = buildLlm();
    if (llm === undefined) {
      setNotice(KEY_HINT);
      return;
    }
    setNotice(undefined);
    setLines([]);
    setPartial(undefined);
    setResult(undefined);
    setPending(undefined);
    setRunning(true);
    const handle = makeRun(llm, input, onEvent);
    handleRef.current = handle;
    const outcome = await handle.result;
    setResult(outcome);
    setPending(undefined);
    setRunning(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
      {hint !== undefined && <div style={{ opacity: 0.7, maxWidth: 720 }}>{hint}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea
          value={input}
          rows={inputRows}
          onChange={(e) => setInput(e.target.value)}
          style={{ ...mono, flex: 1, padding: 8, borderRadius: 6, border: '1px solid var(--border, #ddd)', background: 'var(--bg-input, transparent)', color: 'inherit', resize: 'vertical' }}
        />
        <button onClick={() => void run()} disabled={running} style={{ padding: '8px 16px' }}>
          {running ? 'Running…' : 'Run'}
        </button>
        {running && (
          <button onClick={() => handleRef.current?.abort()} style={{ padding: '8px 12px' }}>
            Stop
          </button>
        )}
      </div>
      {notice !== undefined && <div style={{ color: 'crimson' }}>{notice}</div>}

      {pending !== undefined && (
        <div style={{ ...panel, minHeight: 0, borderColor: 'var(--accent, #7c5cff)' }}>
          <div style={label}>approval required</div>
          <div style={mono}>
            {pending.toolId} — {pending.reason}
          </div>
          <pre style={{ ...mono, margin: '8px 0' }}>{JSON.stringify(pending.args, null, 2)}</pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                handleRef.current?.approve(pending.id);
                setPending(undefined);
              }}
            >
              Approve
            </button>
            <button
              onClick={() => {
                handleRef.current?.deny(pending.id, 'denied in the showroom');
                setPending(undefined);
              }}
            >
              Deny
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div style={label}>events</div>
          <div style={{ ...panel, ...mono }}>
            {lines.length === 0 && <span style={{ opacity: 0.4 }}>run to see the event stream…</span>}
            {lines.map((line) => (
              <div key={line.key} style={{ color: line.tone === 'bad' ? 'crimson' : line.tone === 'ok' ? 'var(--accent, #2e7d32)' : 'inherit' }}>
                {line.text}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div style={label}>{result !== undefined ? 'result' : 'streaming (output-partial)'}</div>
          <div style={panel}>
            {result !== undefined ? (
              <ResultView result={result} />
            ) : partial !== undefined ? (
              <PartialView partial={partial} />
            ) : (
              <span style={{ opacity: 0.4 }}>the envelope streams here as it forms…</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
