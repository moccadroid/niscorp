import { type ZodType } from 'zod';
import type {
  Message, ContentPart, Tool, SignalOptions, Capabilities, ReasoningEffort,
  SignalResult, StreamEvent, StepStreamEvent, StreamOptions,
  ProviderAdapter, ChatAdapter, DecisionAdapter, ProviderRequest, ProviderResponse, Rejection,
  StepRequest, StepResult, StepToolCall, CountInput,
  EmbedOptions, Questions, DecideRequest, DecideResult,
} from './types';
import type { SignalConfig, CustomProviderConfig } from './config';
import { estimateUsage } from './utils/estimate-usage';
import { SignalError, ErrorCode } from './errors';
import { providerRegistry, modelEntry, resolveApiKey, UNMEASURED_MODEL, type ModelEntry, type ProviderEntry } from './registry';
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.adapter';
import { createAnthropicAdapter } from './adapters/anthropic.adapter';
import { createGoogleAdapter } from './adapters/google.adapter';
import { createSystemOneAdapter } from './adapters/systemone.adapter';
import { assertQuestions, acceptCalibrated, acceptUncalibrated, uncalibratedSchemaOf } from './decide/gate';
import { decisionEmulationPrompt } from './transport/protocol';
import { executeStepStream } from './stream/execute-step-stream';
import { runComplete, runStream } from './run';
import { resolveWireStrategies, responseStrategies, recoverRejection, type WireStrategy } from './wire/strategies';
import { routeResponse, routeRejection } from './wire/router';

export type Signal<T = string> = {
  apiKey: (key: string) => Signal<T>;
  model: (model: string) => Signal<T>;
  systemPrompt: (prompt: string) => Signal<T>;
  history: (messages: Message[]) => Signal<T>;
  schema: <U>(schema: ZodType<U>) => Signal<U>;
  tools: (tools: Tool[]) => Signal<T>;
  retries: (count: number) => Signal<T>;
  options: (opts: SignalOptions) => Signal<T>;
  onRetry: (handler: (error: Error, attempt: number) => void) => Signal<T>;
  onToolCall: (handler: (name: string, args: unknown) => void) => Signal<T>;

  complete: (input: string | ContentPart[]) => Promise<SignalResult<T>>;
  stream: (input: string | ContentPart[], options?: StreamOptions) => AsyncIterable<StreamEvent<T>>;

  describe: () => SignalDescription;

  step: (request: StepRequest) => Promise<StepResult>;
  stepStream: (request: StepRequest, options?: StreamOptions) => AsyncIterable<StepStreamEvent>;
  count: (input: CountInput) => Promise<number>;

  embed: {
    (input: string, options?: EmbedOptions): Promise<number[]>;
    (input: string[], options?: EmbedOptions): Promise<number[][]>;
  };

  decide: <const Qs extends Questions>(request: DecideRequest<Qs>) => Promise<DecideResult<Qs>>;
};

export type SignalDescription = {
  provider: string; // registry name, or the custom baseUrl
  model: string | undefined;
  kind: ProviderAdapter['kind'];
  capabilities: Capabilities;
  modelKnown: boolean;
};

type ResolvedProvider = {
  model: string;
  apiKey: string;
  baseUrl: string;
  adapterType: ProviderEntry['adapter'];
  reasoningRequest?: Record<string, unknown>;
};

const resolveProvider = (config: SignalConfig): ResolvedProvider => {
  if (typeof config.provider === 'string') {
    const entry = providerRegistry[config.provider];
    if (!entry) throw new SignalError(`Unknown provider: ${config.provider}`, ErrorCode.PROVIDER_NOT_FOUND);
    const apiKey = resolveApiKey(entry.envKey, config.apiKey);
    if (!apiKey) throw new SignalError(`Missing API key for ${config.provider}. Set ${entry.envKey} or pass apiKey.`, ErrorCode.MISSING_API_KEY);
    return {
      model: config.model ?? entry.defaultModel,
      apiKey,
      baseUrl: entry.baseUrl,
      adapterType: entry.adapter,
      ...(entry.adapter !== 'systemone' && entry.reasoningRequest !== undefined && { reasoningRequest: entry.reasoningRequest }),
    };
  }

  const custom = config.provider;
  const apiKey = custom.apiKey ?? config.apiKey;
  if (!apiKey) throw new SignalError('Missing API key for custom provider', ErrorCode.MISSING_API_KEY);
  const model = config.model ?? custom.model;
  if (!model) throw new SignalError('Missing model for custom provider', ErrorCode.MISSING_MODEL);
  return { model, apiKey, baseUrl: custom.baseUrl, adapterType: custom.adapter ?? 'openai-compatible' };
};

const FALLBACK_CAPABILITIES: Capabilities = {
  nativeTools: false,
  nativeJsonSchema: false,
  nativeJsonMode: false,
  toolsWithStructuredOutput: false,
  validatesToolArgs: false,
  manglesNestedToolArgs: false,
  multimodal: false,
  supportsEmbedding: false,
};

// Read without resolving a key: describe() must not throw for a missing one.
const adapterTypeOf = (config: SignalConfig): ProviderEntry['adapter'] | undefined =>
  typeof config.provider === 'string'
    ? providerRegistry[config.provider]?.adapter
    : config.provider.adapter ?? 'openai-compatible';

const kindOf = (adapterType: ProviderEntry['adapter'] | undefined): ProviderAdapter['kind'] =>
  adapterType === 'systemone' ? 'decisions' : 'chat';

const modelRowOf = (config: SignalConfig): { provider: string; model: string; row: ModelEntry | undefined } | undefined => {
  if (typeof config.provider !== 'string') return undefined;
  const entry = providerRegistry[config.provider];
  if (entry === undefined) return undefined;
  const model = config.model ?? entry.defaultModel;
  return { provider: config.provider, model, row: modelEntry(config.provider, model) };
};

const resolveCapabilities = (config: SignalConfig): Capabilities => {
  if (typeof config.provider === 'string') {
    const entry = providerRegistry[config.provider];
    if (entry === undefined || entry.adapter === 'systemone') return FALLBACK_CAPABILITIES;
    return { ...entry.endpoint, ...(modelRowOf(config)?.row?.capabilities ?? UNMEASURED_MODEL) };
  }
  const declared = config.provider.adapter === 'systemone' ? {} : config.provider.capabilities;
  return { ...FALLBACK_CAPABILITIES, ...declared };
};

const assertEffort = (config: SignalConfig, effort: ReasoningEffort | undefined): void => {
  if (effort === undefined) return;
  const resolved = modelRowOf(config);
  const row = resolved?.row;
  if (resolved === undefined || row === undefined || row.reasoningEfforts.includes(effort)) return;
  const accepted = row.reasoningEfforts.length === 0 ? 'nothing — it takes no reasoning effort' : row.reasoningEfforts.join(', ');
  throw new SignalError(
    `reasoningEffort "${effort}" is not accepted by ${resolved.provider} ${resolved.model} (accepts: ${accepted}; measured ${row.verified})`,
    ErrorCode.VALIDATION_FAILED,
  );
};

const wireIdsOf = (config: SignalConfig): string[] => {
  const source = typeof config.provider === 'string' ? providerRegistry[config.provider] : config.provider;
  return source === undefined || source.adapter === 'systemone' ? [] : source.wire ?? [];
};

const createAdapter = async (resolved: ResolvedProvider, client: unknown): Promise<ProviderAdapter> => {
  switch (resolved.adapterType) {
    case 'openai-compatible':
      return createOpenAICompatibleAdapter({ apiKey: resolved.apiKey, baseUrl: resolved.baseUrl, client, ...(resolved.reasoningRequest !== undefined && { reasoningRequest: resolved.reasoningRequest }) });
    case 'anthropic':
      return createAnthropicAdapter({ apiKey: resolved.apiKey, client });
    case 'google':
      return createGoogleAdapter({ apiKey: resolved.apiKey, client });
    case 'systemone':
      return createSystemOneAdapter({ apiKey: resolved.apiKey, baseUrl: resolved.baseUrl, client });
  }
};

const buildMessages = (config: SignalConfig, input: string | ContentPart[]): Message[] => {
  const messages: Message[] = [];
  if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
  if (config.history) messages.push(...config.history);
  messages.push({ role: 'user', content: input });
  return messages;
};

const recoveredStepResult = (
  recovered: { strategy: string; rejection: Rejection },
  routed: ReturnType<typeof routeRejection>,
  raw: unknown,
  sent: readonly Message[],
): StepResult => ({
  content: '',
  toolCalls: routed.outcome.kind === 'tool_calls' ? routed.outcome.calls : [],
  // The provider bills a rejected generation and its 400 carries no usage.
  usage: estimateUsage(sent, recovered.rejection.argsText, routed.outcome.kind === 'tool_calls' ? routed.outcome.calls : []),
  finishReason: 'error_recovered',
  raw,
  outcome: routed.outcome,
  wire: {
    ...routed.wire,
    recovered: {
      strategy: recovered.strategy,
      ...(recovered.rejection.name !== undefined && { name: recovered.rejection.name }),
      truncated: recovered.rejection.truncated,
    },
  },
});

const createSignalFromConfig = <T = string>(config: SignalConfig): Signal<T> => {
  let cachedAdapter: ProviderAdapter | undefined;
  let cachedAdapterKey: string | undefined;

  const wireStrategies: WireStrategy[] = resolveWireStrategies(wireIdsOf(config));

  assertEffort(config, config.options?.reasoningEffort);

  const getAdapter = async (): Promise<ProviderAdapter> => {
    const resolved = resolveProvider(config);
    const key = `${resolved.adapterType}:${resolved.baseUrl}:${resolved.apiKey}`;
    if (cachedAdapter && cachedAdapterKey === key) return cachedAdapter;
    cachedAdapter = await createAdapter(resolved, config.client);
    cachedAdapterKey = key;
    return cachedAdapter;
  };

  const getChatAdapter = async (verb: string): Promise<ChatAdapter> => {
    const adapter = await getAdapter();
    if (adapter.kind === 'chat') return adapter;
    throw new SignalError(
      `${verb}() is not available on a decision provider — it answers decide() and generates no text`,
      ErrorCode.VERB_NOT_SUPPORTED,
      { verb, adapter: adapter.id },
    );
  };

  const fork = <U = T>(override: Partial<SignalConfig>): Signal<U> =>
    createSignalFromConfig<U>({ ...config, ...override });

  const step = async (request: StepRequest): Promise<StepResult> => {
    const adapter = await getChatAdapter('step');
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
      ...(request.toolChoice !== undefined && { toolChoice: request.toolChoice }),
      ...(request.responseFormat !== undefined && { responseFormat: request.responseFormat }),
      ...((config.options !== undefined || request.options !== undefined) && {
        options: { ...config.options, ...request.options },
      }),
    };
    assertEffort(config, providerRequest.options?.reasoningEffort);
    const declared = new Set((request.tools ?? []).map((tool) => tool.name));
    let response: ProviderResponse;
    try {
      response = await adapter.chat(providerRequest);
    } catch (error) {
      const recovered = recoverRejection(wireStrategies, error);
      if (!recovered) throw error;
      const routed = routeRejection(recovered.rejection, {
        declared,
        ...(request.output && { accept: request.output.accept }),
        ...(request.output?.outputTool !== undefined && { outputTool: request.output.outputTool }),
        responseStrategies: responseStrategies(wireStrategies),
      });
      return recoveredStepResult(recovered, routed, error, providerRequest.messages);
    }
    const toolCalls: StepToolCall[] = (response.toolCalls ?? []).map((call) => {
      let parsed: unknown = call.args;
      if (typeof call.args === 'string') {
        try {
          parsed = JSON.parse(call.args);
        } catch {
          parsed = call.args;
        }
      }
      return { id: call.id, name: call.name, args: parsed };
    });
    const result: StepResult = {
      content: response.content,
      toolCalls,
      // A non-streaming body always carries usage, so a zero here is a reported zero.
      usage: { ...response.usage, reported: true },
      finishReason: response.finishReason,
      raw: response.raw,
    };
    if (!request.output) return result;
    const routed = routeResponse({
      content: result.content,
      toolCalls: result.toolCalls,
      declared,
      accept: request.output.accept,
      ...(request.output.outputTool !== undefined && { outputTool: request.output.outputTool }),
      responseStrategies: responseStrategies(wireStrategies),
    });
    return { ...result, outcome: routed.outcome, wire: routed.wire };
  };

  const stepStreamAs = (verb: string) => (request: StepRequest, streamOptions?: StreamOptions): AsyncIterable<StepStreamEvent> => {
    const run = async function* (): AsyncGenerator<StepStreamEvent> {
      const adapter = await getChatAdapter(verb);
      const resolved = resolveProvider(config);
      const declared = new Set((request.tools ?? []).map((tool) => tool.name));
      const merged: StepRequest =
        config.options !== undefined || request.options !== undefined
          ? { ...request, options: { ...config.options, ...request.options } }
          : request;
      assertEffort(config, merged.options?.reasoningEffort);
      try {
        for await (const event of executeStepStream({
          adapter,
          model: resolved.model,
          request: merged,
          ...(streamOptions && { streamOptions }),
        })) {
          if (event.type === 'done' && request.output) {
            const routed = routeResponse({
              content: event.result.content,
              toolCalls: event.result.toolCalls,
              declared,
              accept: request.output.accept,
              ...(request.output.outputTool !== undefined && { outputTool: request.output.outputTool }),
              responseStrategies: responseStrategies(wireStrategies),
            });
            yield { type: 'done', result: { ...event.result, outcome: routed.outcome, wire: routed.wire } };
            continue;
          }
          yield event;
        }
      } catch (error) {
        // A provider's 400 can land on the first chunk read, not only when the stream is
        // created, so the catch covers the iteration too.
        const recovered = recoverRejection(wireStrategies, error);
        if (!recovered) throw error;
        const routed = routeRejection(recovered.rejection, {
          declared,
          ...(request.output && { accept: request.output.accept }),
          ...(request.output?.outputTool !== undefined && { outputTool: request.output.outputTool }),
          responseStrategies: responseStrategies(wireStrategies),
        });
        yield { type: 'done', result: recoveredStepResult(recovered, routed, error, request.messages) };
      }
    };
    return run();
  };
  const stepStream = stepStreamAs('stepStream');

  const decideCalibrated = async <Qs extends Questions>(
    adapter: DecisionAdapter,
    model: string,
    request: DecideRequest<Qs>,
    started: number,
  ): Promise<DecideResult<Qs>> => {
    const response = await adapter.decide(
      { model, state: request.state, questions: request.questions },
      request.options?.signal !== undefined ? { signal: request.options.signal } : undefined,
    );
    const decisions = acceptCalibrated(request.questions, response.answers, response.raw);
    const inputTokens = response.usage?.inputTokens ?? 0;
    const outputTokens = response.usage?.outputTokens ?? 0;
    return {
      calibrated: true,
      decisions,
      meta: {
        model: response.model ?? model,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, reported: response.usage !== undefined },
        durationMs: Date.now() - started,
        provider: { raw: response.raw },
      },
    };
  };

  const decideEmulated = async <Qs extends Questions>(
    model: string,
    request: DecideRequest<Qs>,
    started: number,
  ): Promise<DecideResult<Qs>> => {
    const state = typeof request.state === 'string' ? request.state : JSON.stringify(request.state);
    const result = await runComplete<unknown>(
      {
        messages: [{ role: 'user', content: decisionEmulationPrompt(state) }],
        schema: uncalibratedSchemaOf(request.questions),
        tools: undefined,
        retries: config.retries ?? 2,
        options: config.options,
        ...(request.options?.signal !== undefined && { streamOptions: { signal: request.options.signal } }),
      },
      { stepStream, model, capabilities: resolveCapabilities(config) },
    );
    return {
      calibrated: false,
      decisions: acceptUncalibrated(request.questions, result.response, result.meta.provider.raw),
      meta: {
        model: result.meta.model,
        // complete() adds reported usage to estimated usage and does not say which.
        usage: { ...result.meta.usage, reported: false },
        durationMs: Date.now() - started,
        provider: { raw: result.meta.provider.raw },
      },
    };
  };

  return {
    apiKey: (key) => fork({ apiKey: key }),
    model: (m) => fork({ model: m }),
    systemPrompt: (prompt) => fork({ systemPrompt: prompt }),
    history: (msgs) => fork({ history: msgs }),
    schema: <U>(s: ZodType<U>) => fork<U>({ schema: s }),
    tools: (t) => fork({ tools: t }),
    retries: (count) => fork({ retries: count }),
    options: (opts) => fork({ options: { ...config.options, ...opts } }),
    onRetry: (handler) => fork({ onRetry: handler }),
    onToolCall: (handler) => fork({ onToolCall: handler }),

    describe: (): SignalDescription => {
      if (typeof config.provider === 'string') {
        const entry = providerRegistry[config.provider];
        return {
          provider: config.provider,
          model: config.model ?? entry?.defaultModel,
          kind: kindOf(adapterTypeOf(config)),
          capabilities: resolveCapabilities(config),
          modelKnown: modelRowOf(config)?.row !== undefined,
        };
      }
      return {
        provider: config.provider.baseUrl,
        model: config.model ?? config.provider.model,
        kind: kindOf(adapterTypeOf(config)),
        capabilities: resolveCapabilities(config),
        modelKnown: false,
      };
    },

    complete: async (input): Promise<SignalResult<T>> =>
      runComplete<T>(
        {
          messages: buildMessages(config, input),
          schema: config.schema,
          tools: config.tools,
          retries: config.retries ?? 2,
          options: config.options,
          onRetry: config.onRetry,
          onToolCall: config.onToolCall,
        },
        { stepStream: stepStreamAs('complete'), model: resolveProvider(config).model, capabilities: resolveCapabilities(config) },
      ),

    stream: (input, streamOptions) =>
      runStream<T>(
        {
          messages: buildMessages(config, input),
          schema: config.schema,
          tools: config.tools,
          retries: config.retries ?? 2,
          options: config.options,
          streamOptions,
          onRetry: config.onRetry,
          onToolCall: config.onToolCall,
        },
        { stepStream: stepStreamAs('stream'), model: resolveProvider(config).model, capabilities: resolveCapabilities(config) },
      ),

    step,
    stepStream,

    embed: (async (input: string | string[], options?: EmbedOptions): Promise<number[] | number[][]> => {
      const adapter = await getChatAdapter('embed');
      if (!adapter.embed) {
        throw new SignalError('This provider does not support embedding', ErrorCode.PROVIDER_ERROR);
      }
      const resolved = resolveProvider(config);
      const response = await adapter.embed({
        model: resolved.model,
        input,
        dimensions: options?.dimensions,
      });
      options?.onUsage?.(response.usage, resolved.model);
      if (typeof input === 'string') {
        const vector = response.embeddings[0];
        if (!vector) throw new SignalError('No embedding returned', ErrorCode.PROVIDER_ERROR);
        return vector;
      }
      return response.embeddings;
    }) as Signal<T>['embed'],

    decide: async <const Qs extends Questions>(request: DecideRequest<Qs>): Promise<DecideResult<Qs>> => {
      assertQuestions(request.questions);
      const started = Date.now();
      const adapter = await getAdapter();
      const model = resolveProvider(config).model;
      return adapter.kind === 'decisions'
        ? decideCalibrated(adapter, model, request, started)
        : decideEmulated(model, request, started);
    },

    count: async (input: CountInput): Promise<number> => {
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
