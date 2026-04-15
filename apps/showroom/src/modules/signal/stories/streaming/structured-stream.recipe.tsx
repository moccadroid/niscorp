import { useRef, useState, type FC } from 'react';
import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import { createStream } from '@niscorp/solid';
import { ResponseCard } from './structured-stream.ui';

// signal + solid, one loop. signal streams JSON tokens; solid
// holds the structural invariant so `current()` is ALWAYS
// shape-valid — even mid-stream, before the closing `}`.
//
// Contract:
//   1. Feed every `{ type: 'text' }` event into `solid.write()`.
//   2. `solid.on(cb)` is your SOLE React-state driver (any other
//      setState on text events and you'll fight solid).
//   3. `solid.close()` on `done`. Your UI latches to the final
//      Zod-validated value.
//
// No JSON.parse, no "wait until done", no defensive `??`.

export const provider = 'groq' as const;
export const model = 'llama-3.3-70b-versatile';
export const systemPrompt =
  'You are a helpful assistant that responds with structured JSON. Always respond with a JSON object matching the schema provided. Write thorough, detailed responses — at least 3-4 paragraphs for the response field and 2-3 paragraphs for reasoning.';
export const userInput =
  'Explain the relationship between gut microbiome diversity and mental health outcomes. Cover the gut-brain axis, key bacterial strains involved, dietary factors, and recent clinical findings. Respond as a widget card with detailed reasoning.';

export const schema = z.object({
  widget: z.object({
    type: z.string(),
    title: z.string(),
    icon: z.string(),
  }),
  response: z.string(),
  reasoning: z.string(),
  meta: z.object({
    confidence: z.number(),
    sources: z.number(),
  }),
});

export type Response = z.infer<typeof schema>;

export const initial: Response = {
  widget: { type: '', title: '', icon: '' },
  response: '',
  reasoning: '',
  meta: { confidence: 0, sources: 0 },
};

type State = 'idle' | 'streaming' | 'done' | 'error';

type Props = { apiKey: string; client?: unknown };

export const Demo: FC<Props> = ({ apiKey, client }) => {
  const [value, setValue] = useState<Response>(initial);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string>('');
  const controllerRef = useRef<AbortController | null>(null);

  const start = async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setValue(initial);
    setError('');
    setState('streaming');

    // Solid: structural invariant. `solid.on` is the SOLE driver
    // of React state; no other setState inside the loop.
    const solid = createStream({ schema, initial });
    solid.on(setValue);

    // Signal: builder chain you'd write anywhere.
    const sig = createSignal(provider, { client })
      .apiKey(apiKey)
      .model(model)
      .systemPrompt(systemPrompt)
      .schema(schema);

    try {
      for await (const ev of sig.stream(userInput, { signal: controller.signal })) {
        if (ev.type === 'text') solid.write(ev.text);
        if (ev.type === 'done') {
          solid.close();
          setState('done');
        }
        if (ev.type === 'error') {
          solid.close();
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

      <ResponseCard value={value} streaming={state === 'streaming'} />
    </div>
  );
};
