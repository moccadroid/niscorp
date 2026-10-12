import type { ChatAdapter, ProviderRequest, ProviderResponse, ProviderStreamDelta, EmbedRequest, EmbedResponse, Message, ContentPart } from '../types';
import { SignalError, ErrorCode } from '../errors';
import { loadSdk } from '../utils/sdk-loader';

type OpenAIMessage = {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

type OpenAICompletion = {
  choices?: Array<{
    message?: {
      role: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type RequestOptions = { signal?: AbortSignal };

type ChatCreateFn = {
  (params: Record<string, unknown> & { stream: true }, options?: RequestOptions): Promise<OpenAIStream>;
  (params: Record<string, unknown>, options?: RequestOptions): Promise<OpenAICompletion>;
};

type OpenAIStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      // Neither is in the SDK's delta type. OpenRouter and Groq's gpt-oss send `reasoning`;
      // GLM and DeepSeek send `reasoning_content`.
      reasoning?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type OpenAIStream = AsyncIterable<OpenAIStreamChunk>;

type OpenAIEmbeddingResponse = {
  data?: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

type EmbedCreateFn = (params: Record<string, unknown>) => Promise<OpenAIEmbeddingResponse>;

const translateContentParts = (parts: ContentPart[]): Array<{ type: string; text?: string; image_url?: { url: string } }> =>
  parts.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    if (part.type === 'image') {
      const url = part.source.type === 'url'
        ? part.source.url
        : `data:${part.source.mediaType};base64,${part.source.data}`;
      return { type: 'image_url', image_url: { url } };
    }
    return { type: 'text', text: '' };
  });

const translateMessage = (msg: Message): OpenAIMessage => {
  switch (msg.role) {
    case 'system':
      return { role: 'system', content: msg.content };
    case 'user':
      return {
        role: 'user',
        content: typeof msg.content === 'string'
          ? msg.content
          : translateContentParts(msg.content),
      };
    case 'assistant': {
      const out: OpenAIMessage = { role: 'assistant', content: msg.content };
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        out.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.args },
        }));
      }
      return out;
    }
    case 'tool':
      return { role: 'tool', content: msg.content, tool_call_id: msg.toolCallId };
    default:
      return { role: 'user', content: '' };
  }
};

const bindAt = <T>(obj: unknown, path: readonly string[]): T | undefined => {
  let parent: unknown;
  let current = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    parent = current;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'function' ? ((current as (...args: unknown[]) => unknown).bind(parent) as T) : undefined;
};

const createSdkInstance = async (config: OpenAICompatibleConfig): Promise<unknown> => {
  const Sdk = await loadSdk('openai');
  const Constructor = (typeof Sdk === 'function' ? Sdk : (Sdk as Record<string, unknown>)['default']) as
    new (params: { apiKey?: string; baseURL?: string; dangerouslyAllowBrowser?: boolean }) => unknown;

  return new Constructor({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: typeof globalThis.window !== 'undefined',
  });
};

const loadSdkFn = async <T>(
  config: OpenAICompatibleConfig,
  path: readonly string[],
  missing: { message: string; code: ErrorCode },
  strictClient: boolean,
): Promise<T> => {
  if (config.client) {
    const fn = bindAt<T>(config.client, path);
    if (fn) return fn;
    if (strictClient) {
      throw new SignalError(`Invalid client: expected client.${path.join('.')} to be a function`, ErrorCode.PROVIDER_ERROR);
    }
  }
  const fn = bindAt<T>(await createSdkInstance(config), path);
  if (!fn) throw new SignalError(missing.message, missing.code);
  return fn;
};

const loadChatCreateFn = (config: OpenAICompatibleConfig): Promise<ChatCreateFn> =>
  loadSdkFn(config, ['chat', 'completions', 'create'], { message: 'Failed to initialize OpenAI SDK', code: ErrorCode.MISSING_SDK }, true);

const loadEmbedCreateFn = (config: OpenAICompatibleConfig): Promise<EmbedCreateFn> =>
  loadSdkFn(
    config,
    ['embeddings', 'create'],
    { message: 'Embedding is not supported by this provider or SDK', code: ErrorCode.PROVIDER_ERROR },
    false,
  );

export type OpenAICompatibleConfig = {
  apiKey: string;
  baseUrl: string;
  client?: unknown;
  reasoningRequest?: Record<string, unknown>;
};

export const createOpenAICompatibleAdapter = async (
  config: OpenAICompatibleConfig,
): Promise<ChatAdapter> => {
  const chatCreate = await loadChatCreateFn(config);

  const buildParams = (request: ProviderRequest): Record<string, unknown> => {
    const params: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(translateMessage),
    };
    if (request.responseFormat) {
      params['response_format'] = request.responseFormat.type === 'json_schema'
        ? { type: 'json_schema', json_schema: request.responseFormat.jsonSchema }
        : { type: 'json_object' };
    }
    if (request.tools?.length) params['tools'] = request.tools;
    if (request.toolChoice !== undefined) {
      params['tool_choice'] = typeof request.toolChoice === 'string'
        ? request.toolChoice
        : { type: 'function', function: { name: request.toolChoice.name } };
    }
    if (request.options?.temperature !== undefined) params['temperature'] = request.options.temperature;
    if (request.options?.maxTokens !== undefined) params['max_completion_tokens'] = request.options.maxTokens;
    if (request.options?.topP !== undefined) params['top_p'] = request.options.topP;
    if (request.options?.stopSequences) params['stop'] = request.options.stopSequences;
    if (request.options?.seed !== undefined) params['seed'] = request.options.seed;
    if (request.options?.reasoningEffort !== undefined)
      params['reasoning_effort'] = request.options.reasoningEffort;
    return params;
  };

  const chat = async (request: ProviderRequest): Promise<ProviderResponse> => {
    const params = buildParams(request);

    let completion: OpenAICompletion;
    try {
      completion = await chatCreate(params);
    } catch (error) {
      throw new SignalError(
        `Provider error: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.PROVIDER_ERROR,
        { raw: error },
      );
    }

    const choice = completion.choices?.[0];
    return {
      content: choice?.message?.content ?? '',
      toolCalls: choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: tc.function.arguments,
      })),
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason ?? 'unknown',
      raw: completion,
    };
  };

  async function* chatStream(request: ProviderRequest, options?: RequestOptions): AsyncIterable<ProviderStreamDelta> {
    const streamParams = {
      ...buildParams(request),
      // Only when the caller set reasoningEffort: Groq answers `reasoning_format` with a 400
      // on its non-reasoning models.
      ...(request.options?.reasoningEffort !== undefined && config.reasoningRequest !== undefined ? config.reasoningRequest : {}),
      stream: true as const,
      stream_options: { include_usage: true },
    };

    let sseStream: OpenAIStream;
    try {
      sseStream = await chatCreate(streamParams, options);
    } catch (error) {
      throw new SignalError(
        `Provider stream error: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.PROVIDER_ERROR,
        { raw: error },
      );
    }

    try {
      for await (const chunk of sseStream) {
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) {
          yield { type: 'text', text: choice.delta.content };
        }
        const reasoning = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content;
        if (reasoning) {
          yield { type: 'reasoning', text: reasoning };
        }
        if (choice?.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            yield {
              type: 'tool_call',
              index: tc.index,
              id: tc.id,
              name: tc.function?.name,
              argsFragment: tc.function?.arguments,
            };
          }
        }
        if (chunk.usage) {
          yield {
            type: 'usage',
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0,
          };
        }
        if (choice?.finish_reason) {
          yield { type: 'finish', finishReason: choice.finish_reason };
        }
      }
    } catch (error) {
      if (error instanceof SignalError) throw error;
      throw new SignalError(
        `Provider stream error: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.PROVIDER_ERROR,
        { raw: error },
      );
    }
  }

  let cachedEmbedCreate: EmbedCreateFn | undefined;

  const embed = async (request: EmbedRequest): Promise<EmbedResponse> => {
    if (!cachedEmbedCreate) cachedEmbedCreate = await loadEmbedCreateFn(config);

    const params: Record<string, unknown> = {
      model: request.model,
      input: request.input,
    };
    if (request.dimensions !== undefined) params['dimensions'] = request.dimensions;

    let response: OpenAIEmbeddingResponse;
    try {
      response = await cachedEmbedCreate(params);
    } catch (error) {
      throw new SignalError(
        `Embedding error: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.PROVIDER_ERROR,
        { raw: error },
      );
    }

    const embeddings = (response.data ?? [])
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);

    return {
      embeddings,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    };
  };

  return { kind: 'chat', id: 'openai-compatible', chat, chatStream, embed };
};
