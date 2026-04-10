// ═══════════════════════════════════════════════════════════
// StubSignalClient — a scripted SignalClient for tests
// ═══════════════════════════════════════════════════════════
//
// Tests hand the stub a queue of step() responses. Each call to
// step() shifts the next scripted response off the queue. Token
// counting uses the same heuristic as the real Signal.

import type {
  SignalClient,
  CortexLlmStepRequest,
  CortexLlmStepResult,
  CortexLlmCountInput,
} from '../../src/llm/signal-client';

export type StubStep = Partial<CortexLlmStepResult> & { content: string };

export type StubSignal = SignalClient & {
  calls: CortexLlmStepRequest[];
  enqueue: (step: StubStep) => void;
};

export const createStubSignal = (initial: StubStep[] = []): StubSignal => {
  const queue: StubStep[] = [...initial];
  const calls: CortexLlmStepRequest[] = [];

  const step = async (request: CortexLlmStepRequest): Promise<CortexLlmStepResult> => {
    calls.push(request);
    const next = queue.shift();
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

  const count = async (input: CortexLlmCountInput): Promise<number> => {
    if (typeof input === 'string') return Math.ceil(input.length / 4);
    let total = 0;
    for (const msg of input) {
      total += typeof msg.content === 'string' ? Math.ceil(msg.content.length / 4) : 0;
    }
    return total;
  };

  return {
    step,
    count,
    calls,
    enqueue: (s) => {
      queue.push(s);
    },
  };
};
