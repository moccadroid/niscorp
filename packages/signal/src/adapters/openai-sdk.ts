import type { EmbedRequest, EmbedResponse } from '../types';
import { SignalError, ErrorCode } from '../errors';
import { loadSdk } from '../utils/sdk-loader';

export type OpenAISdkConfig = {
  apiKey: string;
  baseUrl: string;
  client?: unknown;
};

type OpenAIEmbeddingResponse = {
  data?: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

type EmbedCreateFn = (params: Record<string, unknown>) => Promise<OpenAIEmbeddingResponse>;

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

const createSdkInstance = async (config: OpenAISdkConfig): Promise<unknown> => {
  const Sdk = await loadSdk('openai');
  const Constructor = (typeof Sdk === 'function' ? Sdk : (Sdk as Record<string, unknown>)['default']) as
    new (params: { apiKey?: string; baseURL?: string; dangerouslyAllowBrowser?: boolean }) => unknown;

  return new Constructor({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: typeof globalThis.window !== 'undefined',
  });
};

export const loadSdkFn = async <T>(
  config: OpenAISdkConfig,
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

const loadEmbedCreateFn = (config: OpenAISdkConfig): Promise<EmbedCreateFn> =>
  loadSdkFn(
    config,
    ['embeddings', 'create'],
    { message: 'Embedding is not supported by this provider or SDK', code: ErrorCode.PROVIDER_ERROR },
    false,
  );

export const createEmbed = (config: OpenAISdkConfig): ((request: EmbedRequest) => Promise<EmbedResponse>) => {
  let cachedEmbedCreate: EmbedCreateFn | undefined;

  return async (request) => {
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
};
