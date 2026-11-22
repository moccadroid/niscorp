import type {
  Message, ChatAdapter, ProviderRequest, ProviderStreamDelta,
  StepRequest, StepResult, StepStreamEvent, StepToolCall, StreamOptions,
} from '../types';
import { estimateUsage } from '../utils/estimate-usage';
import { abortForCall, settledOrAborted } from '../utils/abort';

export type ExecuteStepStreamConfig = {
  adapter: ChatAdapter;
  model: string;
  request: StepRequest;
  streamOptions?: StreamOptions;
};

type AssembledToolCall = { id: string; name: string; args: string; index: number };

// Some providers repeat an index for parallel calls: a piece naming an id other than that of the
// call open at its index starts the next call, under an index no earlier call has.
const assembleToolCall = (
  open: Map<number, AssembledToolCall>,
  calls: AssembledToolCall[],
  delta: Extract<ProviderStreamDelta, { type: 'tool_call' }>,
): AssembledToolCall => {
  let tc = open.get(delta.index);
  if (!tc || (delta.id && tc.id && delta.id !== tc.id)) {
    const taken = calls.some((call) => call.index === delta.index);
    const index = taken ? Math.max(...calls.map((call) => call.index)) + 1 : delta.index;
    tc = { id: delta.id ?? '', name: delta.name ?? '', args: '', index };
    open.set(delta.index, tc);
    calls.push(tc);
  }
  if (delta.id) tc.id = delta.id;
  if (delta.name) tc.name = delta.name;
  if (delta.argsFragment) tc.args += delta.argsFragment;
  return tc;
};

export const buildProviderRequest = (
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
  const abort = abortForCall(config.streamOptions?.signal, config.request.options?.signal);
  try {
    yield* streamStep(config, abort.signal);
  } finally {
    abort.release();
  }
}

async function* streamStep(
  config: ExecuteStepStreamConfig,
  abortSignal: AbortSignal | undefined,
): AsyncGenerator<StepStreamEvent> {
  const providerRequest = buildProviderRequest(config.model, config.request);
  if (abortSignal?.aborted) return;

  let contentBuffer = '';
  let finishReason = 'unknown';
  const openToolCalls = new Map<number, AssembledToolCall>();
  const assembledToolCalls: AssembledToolCall[] = [];
  // Replaced, not summed: a usage frame is the running total for the call, and Groq sends
  // the same frame twice on some calls.
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false };

  let deltas: AsyncIterator<ProviderStreamDelta> | undefined;
  let drained = false;
  let abandoned = false;
  try {
  deltas = config.adapter.chatStream(providerRequest, abortSignal ? { signal: abortSignal } : undefined)[Symbol.asyncIterator]();
  while (true) {
    const next = await settledOrAborted(deltas.next(), abortSignal).catch((error: unknown) => {
      drained = true;
      throw error;
    });
    if (next.aborted) {
      abandoned = true;
      return;
    }
    if (abortSignal?.aborted) return;
    if (next.value.done === true) {
      drained = true;
      break;
    }
    const delta = next.value.value;

    switch (delta.type) {
      case 'text':
        contentBuffer += delta.text;
        yield { type: 'text', text: delta.text };
        break;
      case 'reasoning':
        yield { type: 'reasoning', text: delta.text };
        break;
      case 'tool_call': {
        const call = assembleToolCall(openToolCalls, assembledToolCalls, delta);
        yield {
          type: 'tool_call_delta',
          index: call.index,
          ...(delta.id !== undefined && { id: delta.id }),
          ...(delta.name !== undefined && { name: delta.name }),
          argsText: delta.argsFragment ?? '',
        };
        break;
      }
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
  } finally {
    // An abandoned read is still pending, and the iterator closes only after it settles.
    const closing = drained ? undefined : deltas?.return?.();
    if (abandoned) closing?.catch(() => {});
    else await closing;
  }
  if (abortSignal?.aborted) return;

  const toolCalls: StepToolCall[] = assembledToolCalls.map((tc) => {
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
