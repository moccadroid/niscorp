import type {
  Message, ProviderAdapter, ProviderRequest, ProviderStreamDelta,
  StepRequest, StepResult, StepStreamEvent, StepToolCall, StreamOptions,
} from '../types';
import { estimateUsage } from '../utils/estimate-usage';

// ═══════════════════════════════════════════════════════════
// executeStepStream — step-level streaming (one adapter call)
// ═══════════════════════════════════════════════════════════
//
// Mirrors step() but streams. No schema validation, no retries,
// no auto tool execution. The caller (typically @niscorp/cortex)
// owns the tool loop and re-invokes for each iteration.

export type ExecuteStepStreamConfig = {
  adapter: ProviderAdapter;
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
  // REPLACED, not accumulated. Each usage frame is the running total for this
  // call, not an increment — Groq sends the same frame twice on some calls, and
  // adding them reports double what was spent.
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false };

  try {
  for await (const delta of config.adapter.chatStream(providerRequest, abortSignal ? { signal: abortSignal } : undefined)) {
    if (abortSignal?.aborted) return;

    switch (delta.type) {
      case 'text':
        contentBuffer += delta.text;
        yield { type: 'text', text: delta.text };
        break;
      // Reasoning is passed straight through and deliberately NOT added to
      // contentBuffer: it is the model thinking, not its answer.
      case 'reasoning':
        yield { type: 'reasoning', text: delta.text };
        break;
      case 'tool_call':
        assembleToolCall(assembledToolCalls, delta);
        // Surface the fragment so callers can parse function-call
        // payloads progressively (cortex feeds these into solid).
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
    // An aborted fetch rejects the iterator. Discriminate on the SIGNAL's state,
    // not the error type: the adapter re-wraps every iteration error as a
    // SignalError, so there is no AbortError to match on here. A caller who
    // asked to stop gets the same clean early return as a between-delta abort —
    // never a provider error surfaced up to cortex.
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
