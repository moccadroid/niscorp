import { useRef, useState } from 'react';
import { createSignal } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import {
  StreamShell,
  StreamControls,
  ErrorBanner,
  TextStream,
  NoApiKey,
  type RunState,
} from '@showroom/modules/signal/atoms';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';

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

// Everything React — state machine, AbortController plumbing, and
// the for-await loop over sig.stream(). Scroll here to see how
// abort-mid-stream actually works.
const useStream = () => {
  const [text, setText] = useState('');
  const [state, setState] = useState<RunState>('idle');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const apiKey = getKey(provider);

  const start = async (): Promise<void> => {
    if (apiKey === undefined) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setText('');
    setError('');
    setState('streaming');

    const client = createOpenAIClient(provider, apiKey);
    const sig = createSignal(provider, { client })
      .apiKey(apiKey)
      .model(model)
      .systemPrompt(systemPrompt);

    try {
      let buffer = '';
      for await (const ev of sig.stream(userInput, { signal: controller.signal })) {
        if (ev.type === 'text') setText((buffer += ev.text));
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

  return { apiKey, text, state, error, start, stop };
};

export const Demo = () => {
  const { apiKey, text, state, error, start, stop } = useStream();
  if (apiKey === undefined) return <NoApiKey provider={provider} />;
  return (
    <>
      <Pitch
        headline="See every token the moment it arrives."
        body="signal.stream() returns an AsyncIterable of events. Text deltas yield as they arrive from the provider SSE. No buffering, no polling — just a for-await loop. The same builder chain that powers .complete() works here: provider, model, system prompt, tools, schema."
      />
      <StreamShell>
        <StreamControls state={state} onStart={start} onStop={stop} />
        <ErrorBanner message={error} />
        <TextStream text={text} streaming={state === 'streaming'} />
      </StreamShell>
    </>
  );
};
