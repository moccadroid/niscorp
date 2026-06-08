import type { ProviderAdapter, ProviderRequest, ProviderResponse, ProviderStreamDelta, EmbedRequest, EmbedResponse, Message, ContentPart } from '../types';
import { SignalError, ErrorCode } from '../errors';
import { loadSdk } from '../utils/sdk-loader';

// ═══════════════════════════════════════════════════════════
// Types for the OpenAI SDK shape
// ═══════════════════════════════════════════════════════════

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

// Overloaded to mirror the SDK: a request with `stream: true` returns a
// streaming async-iterable; otherwise a single completion. This lets the
// streaming call site resolve to `OpenAIStream` with no cast.
type ChatCreateFn = {
  (params: Record<string, unknown> & { stream: true }): Promise<OpenAIStream>;
  (params: Record<string, unknown>): Promise<OpenAICompletion>;
};

type OpenAIStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
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

// ═══════════════════════════════════════════════════════════
// Message Translation
// ═══════════════════════════════════════════════════════════

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
      // Assistant messages may carry tool calls. When they do, the
      // OpenAI API expects them in the `tool_calls` field of the
      // message and `content` MAY be empty (some models return both).
      // Each subsequent `tool` message references one of these calls
      // by `tool_call_id`. This is the standard OpenAI tool-calling
      // contract — Cortex's tool loop relies on it for multi-step
      // tool use to actually work without hallucination.
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

// ═══════════════════════════════════════════════════════════
// SDK Loading
// ═══════════════════════════════════════════════════════════

const extractChatCreateFn = (obj: unknown): ChatCreateFn | undefined => {
  if (!obj || typeof obj !== 'object') return undefined;
  const chat = (obj as Record<string, unknown>)['chat'];
  if (!chat || typeof chat !== 'object') return undefined;
  const completions = (chat as Record<string, unknown>)['completions'];
  if (!completions || typeof completions !== 'object') return undefined;
  const create = (completions as Record<string, unknown>)['create'];
  if (typeof create !== 'function') return undefined;
  return create.bind(completions) as ChatCreateFn;
};

const extractEmbedCreateFn = (obj: unknown): EmbedCreateFn | undefined => {
  if (!obj || typeof obj !== 'object') return undefined;
  const embeddings = (obj as Record<string, unknown>)['embeddings'];
  if (!embeddings || typeof embeddings !== 'object') return undefined;
  const create = (embeddings as Record<string, unknown>)['create'];
  if (typeof create !== 'function') return undefined;
  return create.bind(embeddings) as EmbedCreateFn;
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

const loadChatCreateFn = async (config: OpenAICompatibleConfig): Promise<ChatCreateFn> => {
  if (config.client) {
    const fn = extractChatCreateFn(config.client);
    if (!fn) throw new SignalError('Invalid client: expected client.chat.completions.create to be a function', ErrorCode.PROVIDER_ERROR);
    return fn;
  }

  const instance = await createSdkInstance(config);
  const fn = extractChatCreateFn(instance);
  if (!fn) throw new SignalError('Failed to initialize OpenAI SDK', ErrorCode.MISSING_SDK);
  return fn;
};

const loadEmbedCreateFn = async (config: OpenAICompatibleConfig): Promise<EmbedCreateFn> => {
  if (config.client) {
    const fn = extractEmbedCreateFn(config.client);
    if (fn) return fn;
  }

  const instance = await createSdkInstance(config);
  const fn = extractEmbedCreateFn(instance);
  if (!fn) throw new SignalError('Embedding is not supported by this provider or SDK', ErrorCode.PROVIDER_ERROR);
  return fn;
};

// ═══════════════════════════════════════════════════════════
// Adapter Factory
// ═══════════════════════════════════════════════════════════

export type OpenAICompatibleConfig = {
  apiKey: string;
  baseUrl: string;
  client?: unknown;
};

export const createOpenAICompatibleAdapter = async (
  config: OpenAICompatibleConfig,
): Promise<ProviderAdapter> => {
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
    if (request.options?.temperature !== undefined) params['temperature'] = request.options.temperature;
    if (request.options?.maxTokens !== undefined) params['max_completion_tokens'] = request.options.maxTokens;
    if (request.options?.topP !== undefined) params['top_p'] = request.options.topP;
    if (request.options?.stopSequences) params['stop'] = request.options.stopSequences;
    if (request.options?.seed !== undefined) params['seed'] = request.options.seed;
    return params;
  };

  const chat = async (request: ProviderRequest): Promise<ProviderResponse> => {
    const params = buildParams(request);

    let completion: OpenAICompletion;
    try {
      completion = await chatCreate(params);
    } catch (error) {
      const recovered = tryRecoverFromError(error);
      if (recovered) return recovered;

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

  async function* chatStream(request: ProviderRequest): AsyncIterable<ProviderStreamDelta> {
    const streamParams = {
      ...buildParams(request),
      stream: true as const,
      stream_options: { include_usage: true },
    };

    let sseStream: OpenAIStream;
    try {
      sseStream = await chatCreate(streamParams);
    } catch (error) {
      throw new SignalError(
        `Provider stream error: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.PROVIDER_ERROR,
        { raw: error },
      );
    }

    for await (const chunk of sseStream) {
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) {
        yield { type: 'text', text: choice.delta.content };
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

  return { id: 'openai-compatible', chat, chatStream, embed };
};

// ═══════════════════════════════════════════════════════════
// Groq Error Recovery
// ═══════════════════════════════════════════════════════════

const RECOVERABLE_CODES = new Set(['tool_use_failed', 'json_validate_failed']);

const prop = (obj: unknown, key: string): unknown => {
  if (!obj || typeof obj !== 'object') return undefined;
  return (obj as Record<string, unknown>)[key];
};

const getErrorCode = (err: unknown): string | undefined => {
  if (!(err instanceof Error)) return undefined;
  const code = prop(err, 'code');
  if (typeof code === 'string') return code;
  const nested = prop(err, 'error');
  const nestedCode = prop(nested, 'code');
  return typeof nestedCode === 'string' ? nestedCode : undefined;
};

const getFailedGeneration = (err: unknown): string | undefined => {
  if (!(err instanceof Error)) return undefined;
  const nested = prop(err, 'error');
  const gen = prop(nested, 'failed_generation');
  return typeof gen === 'string' && gen.trim().length > 0 ? gen : undefined;
};

const tryRecoverFromError = (err: unknown): ProviderResponse | undefined => {
  const code = getErrorCode(err);
  if (!code || !RECOVERABLE_CODES.has(code)) return undefined;

  const failedGen = getFailedGeneration(err);
  if (!failedGen) return undefined;

  let content = failedGen;
  try {
    const parsed = JSON.parse(failedGen);
    if (parsed.arguments && typeof parsed.arguments === 'object') content = JSON.stringify(parsed.arguments);
    else if (parsed.arguments && typeof parsed.arguments === 'string') content = parsed.arguments;
  } catch {
    // Use failedGen as-is
  }

  return {
    content,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    finishReason: 'error_recovered',
    raw: err,
  };
};
