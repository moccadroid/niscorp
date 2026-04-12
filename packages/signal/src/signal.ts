import type { ZodType } from 'zod';
import type {
  Message, ContentPart, Tool, SignalOptions, Capabilities,
  SignalResult, SignalMeta, StreamEvent, StreamOptions,
  ProviderAdapter, ProviderRequest, ProviderResponse,
  StepRequest, StepResult, StepToolCall, StepInputMessage, CountInput,
} from './types';
import type { SignalConfig, CustomProviderConfig } from './config';
import { SignalError, ErrorCode } from './errors';
import { providerRegistry, resolveApiKey } from './registry';
import { createOpenAICompatibleAdapter } from './providers/openai-compatible.adapter';
import { createAnthropicAdapter } from './providers/anthropic.adapter';
import { createGoogleAdapter } from './providers/google.adapter';
import { selectStructuredOutputStrategy, applyStructuredOutput } from './strategy/structured-output';
import { selectToolCallingStrategy, toolsToProviderFormat } from './strategy/tool-calling';
import { runNativeToolLoop } from './tools/tool-loop';
import { runUnifiedSchemaLoop } from './strategy/unified-schema';
import { validateAndRetry } from './validation/retry';
import { executeStream } from './stream/execute-stream';

// ═══════════════════════════════════════════════════════════
// Signal Type (public interface)
// ═══════════════════════════════════════════════════════════

export type Signal<T = string> = {
  // Builder methods — each returns a new Signal
  apiKey: (key: string) => Signal<T>;
  model: (model: string) => Signal<T>;
  systemPrompt: (prompt: string) => Signal<T>;
  history: (messages: Message[]) => Signal<T>;
  schema: <U>(schema: ZodType<U>) => Signal<U>;
  tools: (tools: Tool[]) => Signal<T>;
  retries: (count: number) => Signal<T>;
  options: (opts: SignalOptions) => Signal<T>;
  capabilities: (caps: Partial<Capabilities>) => Signal<T>;
  onRetry: (handler: (error: Error, attempt: number) => void) => Signal<T>;
  onToolCall: (handler: (name: string, args: unknown) => void) => Signal<T>;

  // Execution
  complete: (input: string | ContentPart[]) => Promise<SignalResult<T>>;
  stream: (input: string | ContentPart[], options?: StreamOptions) => AsyncIterable<StreamEvent<T>>;

  // ─── Low-level primitives ─────────────────────────────────
  // step(): one model call, no auto tool execution. The caller
  // owns the loop. Used by @niscorp/cortex which runs its own
  // tool loop with policy gating, ledger attribution, and
  // observation per call.
  step: (request: StepRequest) => Promise<StepResult>;
  // count(): rough token count for an input. Currently a heuristic;
  // will become provider-aware once tokenizer integration lands.
  count: (input: CountInput) => Promise<number>;
};

// ═══════════════════════════════════════════════════════════
// Internal: resolve provider config
// ═══════════════════════════════════════════════════════════

type ResolvedProvider = {
  model: string;
  apiKey: string;
  baseUrl: string;
  adapterType: string;
};

const resolveProvider = (config: SignalConfig): ResolvedProvider => {
  if (typeof config.provider === 'string') {
    const entry = providerRegistry[config.provider];
    if (!entry) throw new SignalError(`Unknown provider: ${config.provider}`, ErrorCode.PROVIDER_NOT_FOUND);
    const apiKey = resolveApiKey(entry.envKey, config.apiKey);
    if (!apiKey) throw new SignalError(`Missing API key for ${config.provider}. Set ${entry.envKey} or pass apiKey.`, ErrorCode.MISSING_API_KEY);
    return { model: config.model ?? entry.defaultModel, apiKey, baseUrl: entry.baseUrl, adapterType: entry.adapter };
  }

  const custom = config.provider;
  const apiKey = custom.apiKey ?? config.apiKey;
  if (!apiKey) throw new SignalError('Missing API key for custom provider', ErrorCode.MISSING_API_KEY);
  const model = config.model ?? custom.model;
  if (!model) throw new SignalError('Missing model for custom provider', ErrorCode.MISSING_MODEL);
  return { model, apiKey, baseUrl: custom.baseUrl, adapterType: custom.adapter ?? 'openai-compatible' };
};

const resolveCapabilities = (config: SignalConfig): Capabilities => {
  const defaults: Capabilities = typeof config.provider === 'string'
    ? providerRegistry[config.provider]?.capabilities ?? { nativeTools: false, nativeJsonSchema: false, nativeJsonMode: false, multimodal: false }
    : { nativeTools: false, nativeJsonSchema: false, nativeJsonMode: false, multimodal: false };
  return { ...defaults, ...config.capabilities };
};

const createAdapter = async (resolved: ResolvedProvider, client: unknown): Promise<ProviderAdapter> => {
  switch (resolved.adapterType) {
    case 'openai-compatible':
      return createOpenAICompatibleAdapter({ apiKey: resolved.apiKey, baseUrl: resolved.baseUrl, client });
    case 'anthropic':
      return createAnthropicAdapter({ apiKey: resolved.apiKey, client });
    case 'google':
      return createGoogleAdapter({ apiKey: resolved.apiKey, client });
    default:
      throw new SignalError(`Unknown adapter type: ${resolved.adapterType}`, ErrorCode.PROVIDER_NOT_FOUND);
  }
};

// ═══════════════════════════════════════════════════════════
// Internal: build message array from config + input
// ═══════════════════════════════════════════════════════════

const buildMessages = (config: SignalConfig, input: string | ContentPart[]): Message[] => {
  const messages: Message[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  if (config.history) messages.push(...config.history);
  messages.push({ role: 'user', content: input });
  return messages;
};

// ═══════════════════════════════════════════════════════════
// Internal: build meta from execution results
// ═══════════════════════════════════════════════════════════

const buildMeta = (
  model: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  durationMs: number,
  toolCalls: SignalMeta['toolCalls'],
  providerRaw: unknown[],
  providerErrors: SignalMeta['provider']['errors'],
  retries: number = 0,
): SignalMeta => ({
  model,
  usage,
  durationMs,
  retries,
  toolCalls,
  provider: {
    raw: providerRaw.length === 1 ? providerRaw[0] : providerRaw,
    errors: providerErrors,
  },
});

// ═══════════════════════════════════════════════════════════
// Internal: aggregate usage from multiple responses
// ═══════════════════════════════════════════════════════════

const aggregateUsage = (responses: ProviderResponse[]): { inputTokens: number; outputTokens: number; totalTokens: number } =>
  responses.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.usage.inputTokens,
      outputTokens: acc.outputTokens + r.usage.outputTokens,
      totalTokens: acc.totalTokens + r.usage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );

// ═══════════════════════════════════════════════════════════
// Internal: parse and validate response content against schema
// ═══════════════════════════════════════════════════════════

const parseResponse = <T>(content: string, schema: ZodType | undefined): T => {
  if (!schema || !content) return content as unknown as T;

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new SignalError(
      'Response is not valid JSON',
      ErrorCode.VALIDATION_FAILED,
      { content: content.slice(0, 200) },
    );
  }

  const result = schema.safeParse(json);
  if (result.success) return result.data as T;

  throw new SignalError(
    'Response failed schema validation',
    ErrorCode.VALIDATION_FAILED,
    {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      content: content.slice(0, 200),
    },
  );
};

// ═══════════════════════════════════════════════════════════
// Internal: execute simple completion (no schema, no tools)
// ═══════════════════════════════════════════════════════════

const executeSimple = async <T>(
  adapter: ProviderAdapter,
  model: string,
  messages: Message[],
  options: SignalOptions | undefined,
  start: number,
): Promise<SignalResult<T>> => {
  const response = await adapter.chat({ model, messages, options });
  return {
    response: response.content as unknown as T,
    history: [...messages, { role: 'assistant', content: response.content }],
    meta: buildMeta(model, response.usage, Date.now() - start, [], [response.raw], []),
  };
};

// ═══════════════════════════════════════════════════════════
// Internal: execute structured output (schema, no tools)
// ═══════════════════════════════════════════════════════════

const executeStructured = async <T>(
  adapter: ProviderAdapter,
  model: string,
  messages: Message[],
  schema: ZodType,
  capabilities: Capabilities,
  retries: number,
  options: SignalOptions | undefined,
  onRetry: ((error: Error, attempt: number) => void) | undefined,
  start: number,
): Promise<SignalResult<T>> => {
  const strategy = selectStructuredOutputStrategy(capabilities);
  const request = applyStructuredOutput({ model, messages, options }, schema, strategy);

  const result = await validateAndRetry<T>({ adapter, request, schema, retries, onRetry });
  const usage = aggregateUsage(result.responses);

  return {
    response: result.parsed,
    history: [...messages, { role: 'assistant', content: result.content }],
    meta: buildMeta(model, usage, Date.now() - start, [], result.responses.map((r) => r.raw), [], result.retryCount),
  };
};

// ═══════════════════════════════════════════════════════════
// Internal: execute with tools
// ═══════════════════════════════════════════════════════════

const executeWithTools = async <T>(
  adapter: ProviderAdapter,
  model: string,
  messages: Message[],
  tools: Tool[],
  schema: ZodType | undefined,
  capabilities: Capabilities,
  retries: number,
  options: SignalOptions | undefined,
  onToolCall: ((name: string, args: unknown) => void) | undefined,
  start: number,
): Promise<SignalResult<T>> => {
  const toolStrategy = selectToolCallingStrategy(capabilities);
  const canUseNativeTools = toolStrategy === 'native' && !schema;

  if (canUseNativeTools) {
    const request: ProviderRequest = { model, messages, tools: toolsToProviderFormat(tools), options };
    const result = await runNativeToolLoop(request, { adapter, tools, maxIterations: 10, onToolCall });

    return {
      response: parseResponse<T>(result.content, schema),
      history: result.messages,
      meta: buildMeta(model, result.usage, Date.now() - start, result.toolCalls, result.providerResponses, result.errors),
    };
  }

  // Unified schema strategy
  const result = await runUnifiedSchemaLoop(
    { model, messages, options },
    { adapter, tools, maxIterations: 10, outputSchema: schema, useJsonSchema: capabilities.nativeJsonSchema, retries, onToolCall },
  );

  return {
    response: parseResponse<T>(result.content, schema),
    history: result.messages,
    meta: buildMeta(model, result.usage, Date.now() - start, result.toolCalls, result.providerResponses, result.errors),
  };
};

// ═══════════════════════════════════════════════════════════
// createSignal — factory function
// ═══════════════════════════════════════════════════════════

const createSignalFromConfig = <T = string>(config: SignalConfig): Signal<T> => {
  // Adapter is lazily created and cached per provider config
  let cachedAdapter: ProviderAdapter | undefined;
  let cachedAdapterKey: string | undefined;

  const getAdapter = async (): Promise<ProviderAdapter> => {
    const resolved = resolveProvider(config);
    const key = `${resolved.adapterType}:${resolved.baseUrl}:${resolved.apiKey}`;
    if (cachedAdapter && cachedAdapterKey === key) return cachedAdapter;
    cachedAdapter = await createAdapter(resolved, config.client);
    cachedAdapterKey = key;
    return cachedAdapter;
  };

  const fork = <U = T>(override: Partial<SignalConfig>): Signal<U> =>
    createSignalFromConfig<U>({ ...config, ...override });

  return {
    // Builder methods
    apiKey: (key) => fork({ apiKey: key }),
    model: (m) => fork({ model: m }),
    systemPrompt: (prompt) => fork({ systemPrompt: prompt }),
    history: (msgs) => fork({ history: msgs }),
    schema: <U>(s: ZodType<U>) => fork<U>({ schema: s }),
    tools: (t) => fork({ tools: t }),
    retries: (count) => fork({ retries: count }),
    options: (opts) => fork({ options: { ...config.options, ...opts } }),
    capabilities: (caps) => fork({ capabilities: { ...config.capabilities, ...caps } }),
    onRetry: (handler) => fork({ onRetry: handler }),
    onToolCall: (handler) => fork({ onToolCall: handler }),

    // Execution
    complete: async (input): Promise<SignalResult<T>> => {
      const start = Date.now();
      const adapter = await getAdapter();
      const resolved = resolveProvider(config);
      const messages = buildMessages(config, input);
      const capabilities = resolveCapabilities(config);
      const retries = config.retries ?? 2;

      const { schema, tools } = config;

      if (!schema && !tools?.length) {
        return executeSimple<T>(adapter, resolved.model, messages, config.options, start);
      }

      if (schema && !tools?.length) {
        return executeStructured<T>(adapter, resolved.model, messages, schema, capabilities, retries, config.options, config.onRetry, start);
      }

      if (tools?.length) {
        return executeWithTools<T>(adapter, resolved.model, messages, tools, schema, capabilities, retries, config.options, config.onToolCall, start);
      }

      return executeSimple<T>(adapter, resolved.model, messages, config.options, start);
    },

    stream: (input, streamOptions) => {
      const run = async function* (): AsyncGenerator<StreamEvent<T>> {
        const adapter = await getAdapter();
        const resolved = resolveProvider(config);
        const messages = buildMessages(config, input);
        const capabilities = resolveCapabilities(config);
        const retries = config.retries ?? 2;

        yield* executeStream<T>({
          adapter,
          model: resolved.model,
          messages,
          schema: config.schema,
          tools: config.tools,
          capabilities,
          retries,
          options: config.options,
          streamOptions,
          onRetry: config.onRetry,
          onToolCall: config.onToolCall,
        });
      };
      return run();
    },

    // ─── Low-level: single adapter call, no tool execution ───
    step: async (request: StepRequest): Promise<StepResult> => {
      const adapter = await getAdapter();
      const resolved = resolveProvider(config);
      const messages = request.messages.slice() as Message[];
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
      const providerRequest: ProviderRequest = {
        model: resolved.model,
        messages,
        ...(providerTools && { tools: providerTools }),
        ...(request.options !== undefined && { options: request.options }),
      };
      const response: ProviderResponse = await adapter.chat(providerRequest);
      const toolCalls: StepToolCall[] = (response.toolCalls ?? []).map((call) => {
        let parsed: unknown = call.args;
        if (typeof call.args === 'string') {
          try {
            parsed = JSON.parse(call.args);
          } catch {
            // Leave args as the raw string if it isn't valid JSON.
            parsed = call.args;
          }
        }
        return { id: call.id, name: call.name, args: parsed };
      });
      return {
        content: response.content,
        toolCalls,
        usage: response.usage,
        finishReason: response.finishReason,
        raw: response.raw,
      };
    },

    // ─── Low-level: token counting (heuristic) ───────────────
    count: async (input: CountInput): Promise<number> => {
      // Heuristic: ~4 characters per token, plus a small per-message
      // overhead for structured inputs. This will be replaced with a
      // provider-aware tokenizer in a follow-up.
      const CHARS_PER_TOKEN = 4;
      if (typeof input === 'string') {
        return Math.ceil(input.length / CHARS_PER_TOKEN);
      }
      let total = 0;
      for (const msg of input) {
        total += 4; // per-message overhead
        if (typeof msg.content === 'string') {
          total += Math.ceil(msg.content.length / CHARS_PER_TOKEN);
          continue;
        }
        for (const part of msg.content) {
          if (part.type === 'text') {
            total += Math.ceil(part.text.length / CHARS_PER_TOKEN);
          } else {
            // Image: rough placeholder.
            total += 256;
          }
        }
      }
      return total;
    },
  };
};

export const createSignal = (
  provider: string | CustomProviderConfig,
  options?: Partial<Omit<SignalConfig, 'provider'>>,
): Signal<string> =>
  createSignalFromConfig<string>({ provider, ...options });
