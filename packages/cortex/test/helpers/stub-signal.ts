// ═══════════════════════════════════════════════════════════
// Scripted SignalClient stub — the loop's test double
// ═══════════════════════════════════════════════════════════
//
// Each call to stepStream consumes the next scripted turn and
// replays it as stream events: text chunks, tool-call deltas
// (name first, then the JSON args split into fragments), then a
// done event whose StepResult matches what signal would return.
// Captured requests let tests assert on the exact transcript the
// model saw.

import { routeResponse, routeRejection } from '@niscorp/signal';
import type {
  Capabilities,
  Rejection,
  StepRequest,
  StepResult,
  StepStreamEvent,
  SignalDescription,
} from '@niscorp/signal';
import type { SignalClient } from '../../src/types';

export type ScriptedCall = { id: string; name: string; args: unknown };

export type ScriptedTurn = {
  // Text streamed before the done event (joined = StepResult.content).
  text?: string[];
  toolCalls?: ScriptedCall[];
  // A provider rejection (Groq 400) as signal's wire layer recovers it —
  // the stub routes it exactly like production and sets finishReason
  // 'error_recovered'.
  rejection?: Rejection;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  finishReason?: string;
};

export type StubSignal = SignalClient & {
  requests: StepRequest[];
};

const GROQ_LIKE: Capabilities = {
  nativeTools: true,
  nativeJsonSchema: false,
  nativeJsonMode: true,
  toolsWithStructuredOutput: false,
  validatesToolArgs: false,
  manglesNestedToolArgs: false,
  multimodal: false,
  supportsEmbedding: false,
};

const splitFragments = (text: string, size: number): string[] => {
  const fragments: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    fragments.push(text.slice(index, index + size));
  }
  return fragments.length > 0 ? fragments : [''];
};

// Routes the scripted turn exactly like production signal: same
// router, same acceptance gate — the stub is a scripted PROVIDER,
// not a scripted wire layer.
const turnResult = (turn: ScriptedTurn, request: StepRequest): StepResult => {
  const declared = new Set((request.tools ?? []).map((tool) => tool.name));
  const routeCommon = {
    declared,
    ...(request.output?.outputTool !== undefined && { outputTool: request.output.outputTool }),
    ...(request.output && { accept: request.output.accept }),
    responseStrategies: [],
  };

  if (turn.rejection) {
    const routed = routeRejection(turn.rejection, routeCommon);
    return {
      content: '',
      toolCalls: routed.outcome.kind === 'tool_calls' ? routed.outcome.calls : [],
      usage: turn.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      finishReason: 'error_recovered',
      raw: null,
      outcome: routed.outcome,
      wire: {
        ...routed.wire,
        recovered: {
          strategy: 'scripted',
          ...(turn.rejection.name !== undefined && { name: turn.rejection.name }),
          truncated: turn.rejection.truncated,
        },
      },
    };
  }

  const base: StepResult = {
    content: (turn.text ?? []).join(''),
    toolCalls: (turn.toolCalls ?? []).map((call) => ({ id: call.id, name: call.name, args: call.args })),
    usage: turn.usage ?? { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    finishReason: turn.finishReason ?? ((turn.toolCalls?.length ?? 0) > 0 ? 'tool_calls' : 'stop'),
    raw: null,
  };
  if (!request.output) return base;
  const routed = routeResponse({
    content: base.content,
    toolCalls: base.toolCalls,
    ...routeCommon,
  });
  return { ...base, outcome: routed.outcome, wire: routed.wire };
};

export const stubSignal = (
  script: ScriptedTurn[],
  options?: { capabilities?: Partial<Capabilities>; model?: string },
): StubSignal => {
  const requests: StepRequest[] = [];
  const capabilities: Capabilities = { ...GROQ_LIKE, ...options?.capabilities };
  let cursor = 0;

  const nextTurn = (): ScriptedTurn => {
    const turn = script[cursor];
    cursor += 1;
    if (!turn) throw new Error(`stubSignal: script exhausted after ${script.length} turn(s)`);
    return turn;
  };

  const describe = (): SignalDescription => ({
    provider: 'stub',
    model: options?.model ?? 'stub-model',
    capabilities,
  });

  return {
    requests,
    describe,
    step: async (request: StepRequest): Promise<StepResult> => {
      requests.push(request);
      return turnResult(nextTurn(), request);
    },
    stepStream: (request: StepRequest): AsyncIterable<StepStreamEvent> => {
      requests.push(request);
      const turn = nextTurn();
      return {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<StepStreamEvent> {
          for (const chunk of turn.text ?? []) {
            yield { type: 'text', text: chunk };
          }
          let callIndex = 0;
          for (const call of turn.toolCalls ?? []) {
            yield { type: 'tool_call_delta', index: callIndex, id: call.id, name: call.name, argsText: '' };
            const argsText = typeof call.args === 'string' ? call.args : JSON.stringify(call.args);
            for (const fragment of splitFragments(argsText, 7)) {
              yield { type: 'tool_call_delta', index: callIndex, argsText: fragment };
            }
            callIndex += 1;
          }
          yield { type: 'done', result: turnResult(turn, request) };
        },
      };
    },
    count: async (input): Promise<number> =>
      typeof input === 'string' ? Math.ceil(input.length / 4) : input.length * 8,
  };
};
