import type {
  Message, ChatAdapter, ProviderRequest, ProviderStreamDelta,
  StepRequest, StepResult, StepStreamEvent, StepToolCall, StreamOptions,
} from '../types';
import { estimateUsage } from '../utils/estimate-usage';

export type ExecuteStepStreamConfig = {
  adapter: ChatAdapter;
  model: string;
  request: StepRequest;
  streamOptions?: StreamOptions;
};

type AssembledToolCall = { id: string; name: string; args: string };


const assembleToolCall = (
  map: Map<number, AssembledToolCall>,
  delta: Extract<ProviderStreamDelta, { type: 'tool_call' }>,
): void => {
  let tc = map.get(delta.index);
  if (!tc) {
    tc = { id: delta.id ?? '', name: delta.name ?? '', args: '' };
    map.set(delta.index, tc);
  }
  if (delta.id) tc.id = delta.id;
  if (delta.name) tc.name = delta.name;
  if (delta.argsFragment) tc.args += delta.argsFragment;
};

const buildProviderRequest = (
  model: string,
  request: StepRequest,
): ProviderRequest => {
  const providerTools = request.tools && request.tools.length > 0
    ? request.tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }))
    : undefined;
  return {
    model,
    messages: request.messages.slice() as Message[],
    ...(providerTools && { tools: providerTools }),
    ...(request.toolChoice !== undefined && { toolChoice: request.toolChoice }),
    ...(request.responseFormat !== undefined && { responseFormat: request.responseFormat }),
    ...(request.options !== undefined && { options: request.options }),
  };
};

export async function* executeStepStream(
  config: ExecuteStepStreamConfig,
): AsyncGenerator<StepStreamEvent> {
  const providerRequest = buildProviderRequest(config.model, config.request);
  const abortSignal = config.streamOptions?.signal;

  let contentBuffer = '';
  let finishReason = 'unknown';
  const assembledToolCalls = new Map<number, AssembledToolCall>();
  // Replaced, not summed: a usage frame is the running total for the call, and Groq sends
  // the same frame twice on some calls.
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false };

  try {
  for await (const delta of config.adapter.chatStream(providerRequest, abortSignal ? { signal: abortSignal } : undefined)) {
    if (abortSignal?.aborted) return;

    switch (delta.type) {
      case 'text':
        contentBuffer += delta.text;
        yield { type: 'text', text: delta.text };
        break;
      case 'reasoning':
        yield { type: 'reasoning', text: delta.text };
        break;
      case 'tool_call':
        assembleToolCall(assembledToolCalls, delta);
        yield {
          type: 'tool_call_delta',
          index: delta.index,
          ...(delta.id !== undefined && { id: delta.id }),
          ...(delta.name !== undefined && { name: delta.name }),
          argsText: delta.argsFragment ?? '',
        };
        break;
      case 'usage':
        totalUsage = {
          inputTokens: delta.inputTokens,
          outputTokens: delta.outputTokens,
          totalTokens: delta.totalTokens,
          reported: true,
        };
        break;
      case 'finish':
        finishReason = delta.finishReason;
        break;
    }
  }
  } catch (error) {
    // By the signal's state, not the error's type: the adapter wraps every iteration error
    // in a SignalError, so no AbortError arrives here.
    if (abortSignal?.aborted) return;
    throw error;
  }

  const toolCalls: StepToolCall[] = [...assembledToolCalls.values()].map((tc) => {
    let parsed: unknown = tc.args;
    if (typeof tc.args === 'string' && tc.args.length > 0) {
      try {
        parsed = JSON.parse(tc.args);
      } catch {
        parsed = tc.args;
      }
    }
    return { id: tc.id, name: tc.name, args: parsed };
  });

  const result: StepResult = {
    content: contentBuffer,
    toolCalls,
    usage: totalUsage.reported ? totalUsage : estimateUsage(providerRequest.messages, contentBuffer, toolCalls),
    finishReason,
    raw: null,
  };

  yield { type: 'done', result };
}
