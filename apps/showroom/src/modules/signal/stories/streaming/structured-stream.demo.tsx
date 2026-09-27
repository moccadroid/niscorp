import { useRef, useState } from 'react';
import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import { createStream } from '@niscorp/solid';
import { Pitch } from '@showroom/chrome/pitch';
import {
  StreamShell,
  StreamControls,
  ErrorBanner,
  type RunState,
} from '@showroom/modules/signal/atoms';
import { resolveModel } from '@showroom/modules/signal/openai-client';
import { ModelBadge } from '@showroom/modules/signal/atoms/model-badge';
import { answerWith } from '@showroom/lib/scripted-model/scripts';
import { STREAM_WIDGET } from '@showroom/modules/signal/scripted/answers';

// No API key: the scripted provider streams the answer written for this
// page's prompt, token by token, through the real signal stream.
answerWith('signal/structured-stream', STREAM_WIDGET);
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
export const model = 'qwen/qwen3.8-27b';
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

// React plumbing + the signal+solid loop. `solid.on` is the sole
// React-state driver; the `sig.stream()` for-await pumps text
// events into `solid.write()` and closes solid on done/error.
const useStream = () => {
  const [value, setValue] = useState<Response>(initial);
  const [state, setState] = useState<RunState>('idle');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const scripted = resolveModel(provider).scripted;

  const start = async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setValue(initial);
    setError('');
    setState('streaming');

    const { apiKey, client } = resolveModel(provider);
    const solid = createStream({ schema, initial });
    solid.on(setValue);

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

  return { scripted, value, state, error, start, stop };
};

export const Demo = () => {
  const { scripted, value, state, error, start, stop } = useStream();
  return (
    <>
      <Pitch
        headline="Structured output, streaming, always valid."
        body="This is the full stack: signal handles the LLM connection, retry, and abort. Solid handles the structural invariant — every field is type-checked at value-open, bad values are rejected, and current() is always safe to render. The consumer just pipes text events into solid.write(). Two libraries, zero glue code, one for-await loop."
      />
      <ModelBadge scripted={scripted} />
      <StreamShell>
        <StreamControls state={state} onStart={start} onStop={stop} />
        <ErrorBanner message={error} />
        <ResponseCard value={value} streaming={state === 'streaming'} />
      </StreamShell>
    </>
  );
};
