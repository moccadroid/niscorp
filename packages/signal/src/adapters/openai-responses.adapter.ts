import type { ChatAdapter, ContentPart, Message, ProviderRequest, ProviderResponse, ProviderStreamDelta } from '../types';
import { SignalError, ErrorCode } from '../errors';
import { createEmbed, loadSdkFn, type OpenAISdkConfig } from './openai-sdk';

type InputItem = Record<string, unknown>;

type OutputItem = {
  type: string;
  content?: Array<{ type: string; text?: string }>;
  call_id?: string;
  name?: string;
  arguments?: string;
};

type ResponsesUsage = { input_tokens?: number; output_tokens?: number; total_tokens?: number };

type ResponsesResponse = {
  status?: string;
  output?: OutputItem[];
  usage?: ResponsesUsage;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
};

type ResponsesStreamEvent = {
  type: string;
  delta?: string;
  output_index?: number;
  item?: OutputItem;
  response?: ResponsesResponse;
  message?: string;
};

type RequestOptions = { signal?: AbortSignal };

type ResponsesCreateFn = {
  (params: Record<string, unknown> & { stream: true }, options?: RequestOptions): Promise<AsyncIterable<ResponsesStreamEvent>>;
  (params: Record<string, unknown>, options?: RequestOptions): Promise<ResponsesResponse>;
};

const translateContent = (parts: ContentPart[]): InputItem[] =>
  parts.map((part) => {
    if (part.type === 'text') return { type: 'input_text', text: part.text };
    const url = part.source.type === 'url' ? part.source.url : `data:${part.source.mediaType};base64,${part.source.data}`;
    return { type: 'input_image', image_url: url, detail: 'auto' };
  });

const translateMessage = (msg: Message): InputItem[] => {
  switch (msg.role) {
    case 'system':
      return [{ role: 'system', content: msg.content }];
    case 'user':
      return [{ role: 'user', content: typeof msg.content === 'string' ? msg.content : translateContent(msg.content) }];
    case 'assistant':
      return [
        ...(msg.content !== '' ? [{ role: 'assistant', content: msg.content }] : []),
        ...(msg.toolCalls ?? []).map((call) => ({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.args })),
      ];
    case 'tool':
      return [{ type: 'function_call_output', call_id: msg.toolCallId, output: msg.content }];
  }
};

const refuseUnsupportedOptions = (request: ProviderRequest): void => {
  for (const option of ['stopSequences', 'seed'] as const) {
    if (request.options?.[option] !== undefined) {
      throw new SignalError(`The Responses API takes no ${option}`, ErrorCode.VALIDATION_FAILED, { option });
    }
  }
};

const buildParams = (request: ProviderRequest): Record<string, unknown> => {
  refuseUnsupportedOptions(request);
  const params: Record<string, unknown> = {
    model: request.model,
    input: request.messages.flatMap(translateMessage),
    store: false,
  };
  if (request.responseFormat) {
    params['text'] = {
      format: request.responseFormat.type === 'json_schema'
        ? { type: 'json_schema', ...request.responseFormat.jsonSchema }
        : { type: 'json_object' },
    };
  }
  if (request.tools?.length) {
    // Responses makes a function tool strict unless told otherwise, and strict mode refuses
    // most of the schemas signal sends.
    params['tools'] = request.tools.map(({ function: fn }) => ({
      type: 'function',
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
      strict: false,
    }));
  }
  if (request.toolChoice !== undefined) {
    params['tool_choice'] = typeof request.toolChoice === 'string'
      ? request.toolChoice
      : { type: 'function', name: request.toolChoice.name };
  }
  const options = request.options;
  if (options?.temperature !== undefined) params['temperature'] = options.temperature;
  if (options?.maxTokens !== undefined) params['max_output_tokens'] = options.maxTokens;
  if (options?.topP !== undefined) params['top_p'] = options.topP;
  if (options?.reasoningEffort !== undefined) params['reasoning'] = { effort: options.reasoningEffort };
  return params;
};

const textOf = (output: OutputItem[]): string =>
  output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('');

const toolCallsOf = (output: OutputItem[]): Array<{ id: string; name: string; args: string }> =>
  output.flatMap((item) =>
    item.type === 'function_call' && item.call_id !== undefined && item.name !== undefined
      ? [{ id: item.call_id, name: item.name, args: item.arguments ?? '' }]
      : [],
  );

const usageOf = (usage: ResponsesUsage | undefined): ProviderResponse['usage'] => ({
  inputTokens: usage?.input_tokens ?? 0,
  outputTokens: usage?.output_tokens ?? 0,
  totalTokens: usage?.total_tokens ?? 0,
});

// Reported in the chat-completions words the other adapter uses.
const finishReasonOf = (response: ResponsesResponse): string => {
  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason;
    return reason === 'max_output_tokens' ? 'length' : reason ?? 'incomplete';
  }
  if ((response.output ?? []).some((item) => item.type === 'function_call')) return 'tool_calls';
  return response.status === 'completed' ? 'stop' : response.status ?? 'unknown';
};

const providerError = (prefix: string, error: unknown): SignalError =>
  error instanceof SignalError
    ? error
    : new SignalError(`${prefix}: ${error instanceof Error ? error.message : String(error)}`, ErrorCode.PROVIDER_ERROR, { raw: error });

const deltasOf = (event: ResponsesStreamEvent, callIndexOf: (outputIndex: number) => number): ProviderStreamDelta[] => {
  switch (event.type) {
    case 'response.output_text.delta':
      return event.delta ? [{ type: 'text', text: event.delta }] : [];
    case 'response.reasoning_text.delta':
      return event.delta ? [{ type: 'reasoning', text: event.delta }] : [];
    case 'response.output_item.added':
      return event.item?.type === 'function_call' && event.output_index !== undefined
        ? [{ type: 'tool_call', index: callIndexOf(event.output_index), id: event.item.call_id, name: event.item.name, argsFragment: event.item.arguments }]
        : [];
    case 'response.function_call_arguments.delta':
      return event.output_index !== undefined ? [{ type: 'tool_call', index: callIndexOf(event.output_index), argsFragment: event.delta }] : [];
    case 'response.completed':
    case 'response.incomplete': {
      const response = event.response ?? {};
      return [
        ...(response.usage ? [{ type: 'usage' as const, ...usageOf(response.usage) }] : []),
        { type: 'finish', finishReason: finishReasonOf(response) },
      ];
    }
    case 'response.failed':
      throw new SignalError(`Provider stream error: ${event.response?.error?.message ?? 'the response failed'}`, ErrorCode.PROVIDER_ERROR, { raw: event });
    case 'error':
      throw new SignalError(`Provider stream error: ${event.message ?? 'unknown error'}`, ErrorCode.PROVIDER_ERROR, { raw: event });
    default:
      return [];
  }
};

export const createOpenAIResponsesAdapter = async (config: OpenAISdkConfig): Promise<ChatAdapter> => {
  const responsesCreate = await loadSdkFn<ResponsesCreateFn>(
    config,
    ['responses', 'create'],
    { message: 'Failed to initialize OpenAI SDK', code: ErrorCode.MISSING_SDK },
    true,
  );

  const chat = async (request: ProviderRequest): Promise<ProviderResponse> => {
    const params = buildParams(request);
    let response: ResponsesResponse;
    try {
      response = await responsesCreate(params);
    } catch (error) {
      throw providerError('Provider error', error);
    }
    if (response.error) {
      throw new SignalError(`Provider error: ${response.error.message ?? 'the response failed'}`, ErrorCode.PROVIDER_ERROR, { raw: response });
    }
    const output = response.output ?? [];
    const toolCalls = toolCallsOf(output);
    return {
      content: textOf(output),
      ...(toolCalls.length > 0 && { toolCalls }),
      usage: usageOf(response.usage),
      finishReason: finishReasonOf(response),
      raw: response,
    };
  };

  async function* chatStream(request: ProviderRequest, options?: RequestOptions): AsyncIterable<ProviderStreamDelta> {
    const params = { ...buildParams(request), stream: true as const };
    let events: AsyncIterable<ResponsesStreamEvent>;
    try {
      events = await responsesCreate(params, options);
    } catch (error) {
      throw providerError('Provider stream error', error);
    }
    // Responses numbers every output item; a tool_call delta's index counts calls only.
    const callIndexes = new Map<number, number>();
    const callIndexOf = (outputIndex: number): number => {
      const known = callIndexes.get(outputIndex);
      if (known !== undefined) return known;
      callIndexes.set(outputIndex, callIndexes.size);
      return callIndexes.size - 1;
    };
    try {
      for await (const event of events) yield* deltasOf(event, callIndexOf);
    } catch (error) {
      throw providerError('Provider stream error', error);
    }
  }

  return { kind: 'chat', id: 'openai-responses', chat, chatStream, embed: createEmbed(config) };
};
