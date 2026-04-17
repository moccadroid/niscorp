// ═══════════════════════════════════════════════════════════
// StubSignalClient — a scripted SignalClient for tests
// ═══════════════════════════════════════════════════════════
//
// Hand the stub a queue of responses. step() and stream() each shift
// one entry off the queue. stream() yields `chunks` (or `content` as
// a single chunk when `chunks` is omitted) followed by one `done`
// event carrying the aggregated StepResult.
//
// Invariant: when `chunks` is provided, chunks.join('') must equal
// content — enforced at enqueue time so tests can't silently have
// streamed output diverge from the done result.

import type { SignalClient } from '../../src/llm/signal-client';
import type {
  StepRequest,
  StepResult,
  StepStreamEvent,
  StreamOptions,
  CountInput,
} from '@niscorp/signal';

export type StubStep = Partial<StepResult> & {
  content: string;
  chunks?: ReadonlyArray<string>;
};

export type StubSignal = SignalClient & {
  calls: StepRequest[];
  streamCalls: StepRequest[];
  enqueue: (step: StubStep) => void;
};

const validateStep = (step: StubStep): void => {
  if (step.chunks && step.chunks.join('') !== step.content) {
    throw new Error(
      `StubStep invariant: chunks.join('') must equal content. Got chunks="${step.chunks.join('')}" vs content="${step.content}"`,
    );
  }
};

const fillStep = (next: StubStep | undefined): StepResult => {
  if (!next) {
    return {
      content: '',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      finishReason: 'stop',
    };
  }
  return {
    content: next.content,
    toolCalls: next.toolCalls ?? [],
    usage: next.usage ?? { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    finishReason: next.finishReason ?? 'stop',
  };
};

export const createStubSignal = (initial: StubStep[] = []): StubSignal => {
  for (const s of initial) validateStep(s);
  const queue: StubStep[] = [...initial];
  const calls: StepRequest[] = [];
  const streamCalls: StepRequest[] = [];

  const step = async (request: StepRequest): Promise<StepResult> => {
    calls.push(request);
    return fillStep(queue.shift());
  };

  const stream = (
    request: StepRequest,
    options?: StreamOptions,
  ): AsyncIterable<StepStreamEvent> => {
    streamCalls.push(request);
    const next = queue.shift();
    const result = fillStep(next);
    // When `chunks` is omitted, stream the full content as one delta.
    // Explicit chunks (validated at enqueue) take precedence for tests
    // that need to simulate multi-chunk streaming.
    const chunks = next?.chunks ?? (result.content.length > 0 ? [result.content] : []);
    const abortSignal = options?.signal;

    return {
      async *[Symbol.asyncIterator]() {
        for (const text of chunks) {
          if (abortSignal?.aborted) return;
          yield { type: 'text', text };
        }
        if (abortSignal?.aborted) return;
        yield { type: 'done', result };
      },
    };
  };

  const count = async (input: CountInput): Promise<number> => {
    if (typeof input === 'string') return Math.ceil(input.length / 4);
    let total = 0;
    for (const msg of input) {
      total += typeof msg.content === 'string' ? Math.ceil(msg.content.length / 4) : 0;
    }
    return total;
  };

  return {
    step,
    stream,
    count,
    calls,
    streamCalls,
    enqueue: (s) => {
      validateStep(s);
      queue.push(s);
    },
  };
};
