import { useRef, useState } from 'react';
import { createSignal } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import {
  StreamShell,
  StreamControls,
  ErrorBanner,
  TextStream,
  type RunState,
} from '@showroom/modules/signal/atoms';
import { resolveModel } from '@showroom/modules/signal/openai-client';
import { ModelBadge } from '@showroom/modules/signal/atoms/model-badge';
import { answerWith } from '@showroom/lib/scripted-model/scripts';
import { STREAM_TEXT } from '@showroom/modules/signal/scripted/answers';

// No API key: the scripted provider streams the answer written for this
// page's prompt, token by token, through the real signal stream.
answerWith('signal/text-stream', STREAM_TEXT);

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
export const model = 'qwen/qwen3.8-27b';
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
  const scripted = resolveModel(provider).scripted;

  const start = async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setText('');
    setError('');
    setState('streaming');

    const { apiKey, client } = resolveModel(provider);
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

  return { scripted, text, state, error, start, stop };
};

export const Demo = () => {
  const { scripted, text, state, error, start, stop } = useStream();
  return (
    <>
      <Pitch
        headline="See every token the moment it arrives."
        body="signal.stream() returns an AsyncIterable of events. Text deltas yield as they arrive from the provider SSE. No buffering, no polling — just a for-await loop. The same builder chain that powers .complete() works here: provider, model, system prompt, tools, schema."
      />
      <ModelBadge scripted={scripted} />
      <StreamShell>
        <StreamControls state={state} onStart={start} onStop={stop} />
        <ErrorBanner message={error} />
        <TextStream text={text} streaming={state === 'streaming'} />
      </StreamShell>
    </>
  );
};
