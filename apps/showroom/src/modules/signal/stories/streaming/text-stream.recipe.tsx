import { useRef, useState, type FC } from 'react';
import { createSignal } from '@niscorp/signal';

// `signal.stream(input)` returns an AsyncIterable of events:
//   { type: 'text', text: '...' } — incremental tokens
//   { type: 'retry', attempt: N } — schema validation retry
//   { type: 'done', meta: {...} } — final usage/timing
//   { type: 'error', error: ... } — terminal failure
//
// Aborts piggy-back on the standard `AbortController`: pass its
// signal via `.stream(input, { signal })` and call `.abort()` to
// stop mid-stream. The for-await loop exits cleanly.

export const provider = 'groq' as const;
export const model = 'llama-3.3-70b-versatile';
export const systemPrompt =
  'You are a thorough technical writer. Give detailed, well-structured answers with examples. Use markdown formatting.';
export const userInput =
  'Write a comprehensive guide to ownership, borrowing, and lifetimes in Rust. Cover the borrow checker, mutable vs immutable references, lifetime annotations, and common pitfalls. Include code examples for each concept.';

type State = 'idle' | 'streaming' | 'done' | 'error';

type Props = { apiKey: string; client?: unknown };

export const Demo: FC<Props> = ({ apiKey, client }) => {
  const [text, setText] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  const start = async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setText('');
    setError('');
    setState('streaming');

    const sig = createSignal(provider, { client })
      .apiKey(apiKey)
      .model(model)
      .systemPrompt(systemPrompt);

    try {
      let buffer = '';
      for await (const ev of sig.stream(userInput, { signal: controller.signal })) {
        if (ev.type === 'text') {
          buffer += ev.text;
          setText(buffer);
        }
        if (ev.type === 'done') setState('done');
        if (ev.type === 'error') {
          setError(ev.error.message);
          setState('error');
          return;
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      }
    }
  };

  const stop = (): void => {
    controllerRef.current?.abort();
    setState('done');
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '0 0 16px 0' }}>
        <button
          onClick={() => void start()}
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
          {state === 'streaming' ? 'Streaming…' : state === 'done' ? 'Restart' : 'Start'}
        </button>
        {state === 'streaming' && (
          <button
            onClick={stop}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#dc2626',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}
      </div>

      {error !== '' && (
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
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          borderRadius: 8,
          padding: 16,
          fontSize: 13,
          fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
          lineHeight: 1.6,
          minHeight: 80,
          maxHeight: 500,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          border:
            state === 'streaming' ? '2px solid #2563eb' : '2px solid transparent',
          transition: 'border-color 200ms',
        }}
      >
        {text || (state === 'idle' ? 'Waiting…' : '')}
        {state === 'streaming' && <span style={{ color: '#6b7280' }}>▌</span>}
      </div>
    </div>
  );
};
