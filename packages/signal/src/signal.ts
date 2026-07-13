import { type ZodType } from 'zod';
import type {
  Message, ContentPart, Tool, SignalOptions, Capabilities,
  SignalResult, StreamEvent, StepStreamEvent, StreamOptions,
  ProviderAdapter, ProviderRequest, ProviderResponse, Rejection,
  StepRequest, StepResult, StepToolCall, CountInput,
  EmbedOptions,
} from './types';
import type { SignalConfig, CustomProviderConfig } from './config';
import { SignalError, ErrorCode } from './errors';
import { providerRegistry, resolveApiKey } from './registry';
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.adapter';
import { createAnthropicAdapter } from './adapters/anthropic.adapter';
import { createGoogleAdapter } from './adapters/google.adapter';
import { executeStepStream } from './stream/execute-step-stream';
import { runComplete, runStream } from './run';
import { resolveWireStrategies, responseStrategies, recoverRejection, type WireStrategy } from './wire/strategies';
import { routeResponse, routeRejection } from './wire/router';

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

  // describe(): what this client resolves to — provider, model,
  // effective capabilities. Never hits the network and never throws
  // for missing API keys. Orchestrators (cortex) use it to pick
  // output strategies; previews use it to explain themselves.
  describe: () => SignalDescription;

  // ─── Low-level primitives ─────────────────────────────────
  // step(): one model call, no auto tool execution. The caller
  // owns the loop. Used by @niscorp/cortex which runs its own
  // tool loop with policy gating, ledger attribution, and
  // observation per call.
  step: (request: StepRequest) => Promise<StepResult>;
  // stepStream(): the streaming variant of step(). Same single-call
  // semantics — no schema validation, no auto tool execution, no
  // retries — but yields text deltas incrementally and a final `done`
  // event carrying the aggregated StepResult. The caller still owns
  // the tool loop. Used by @niscorp/cortex when streaming is opted in.
  stepStream: (request: StepRequest, options?: StreamOptions) => AsyncIterable<StepStreamEvent>;
  // count(): rough token count for an input. Currently a heuristic;
  // will become provider-aware once tokenizer integration lands.
  count: (input: CountInput) => Promise<number>;

  // ─── Embedding ────────────────────────────────────────────
  embed: {
    (input: string, options?: EmbedOptions): Promise<number[]>;
    (input: string[], options?: EmbedOptions): Promise<number[][]>;
  };
};

// What a Signal client resolves to, without touching the network.
export type SignalDescription = {
  provider: string;              // registry name, or the custom baseUrl
  model: string | undefined;     // undefined only for custom providers with no model set
  capabilities: Capabilities;
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

const resolveCapabilities = (config: SignalConfig): Capabilities => {
  if (typeof config.provider === 'string') {
    const defaults = providerRegistry[config.provider]?.capabilities ?? FALLBACK_CAPABILITIES;
    return { ...defaults, ...config.capabilities };
  }
  // Custom providers may declare capabilities on the provider config;
  // instance-level .capabilities() overrides still win.
  return { ...FALLBACK_CAPABILITIES, ...config.provider.capabilities, ...config.capabilities };
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
// createSignal — factory function
// ═══════════════════════════════════════════════════════════

// Build a recovered StepResult from a provider rejection: the routed
// view of the attempt the 400 carried. toolCalls is populated when the
// rejection routes back to a declared tool, so transcripts pair the
// call with its eventual tool message exactly like an accepted turn.
const recoveredStepResult = (
  recovered: { strategy: string; rejection: Rejection },
  routed: ReturnType<typeof routeRejection>,
  raw: unknown,
): StepResult => ({
  content: '',
  toolCalls: routed.outcome.kind === 'tool_calls' ? routed.outcome.calls : [],
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
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
  // Adapter is lazily created and cached per provider config
  let cachedAdapter: ProviderAdapter | undefined;
  let cachedAdapterKey: string | undefined;

  // Provider wire strategies — data from the registry entry (or the
  // custom provider config), resolved once. Unknown ids throw here,
  // at construction, not mid-run.
  const wireStrategies: WireStrategy[] = resolveWireStrategies(
    typeof config.provider === 'string'
      ? providerRegistry[config.provider]?.wire ?? []
      : config.provider.wire ?? [],
  );

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

  // ─── step / stepStream — the ONE execution core ────────────
  // Everything above (complete/stream) is a wrapper over these, so the
  // wire layer serves every entry point identically.

  const step = async (request: StepRequest): Promise<StepResult> => {
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
      ...(request.toolChoice !== undefined && { toolChoice: request.toolChoice }),
      ...(request.responseFormat !== undefined && { responseFormat: request.responseFormat }),
      ...(request.options !== undefined && { options: request.options }),
    };
    const declared = new Set((request.tools ?? []).map((tool) => tool.name));
    let response: ProviderResponse;
    try {
      response = await adapter.chat(providerRequest);
    } catch (error) {
      // The wire layer: provider rejections that carry the model's
      // attempt are recovered by a registry-selected strategy and
      // ROUTED like any response. No strategy claims it → rethrow.
      const recovered = recoverRejection(wireStrategies, error);
      if (!recovered) throw error;
      const routed = routeRejection(recovered.rejection, {
        declared,
        ...(request.output && { accept: request.output.accept }),
        ...(request.output?.outputTool !== undefined && { outputTool: request.output.outputTool }),
        responseStrategies: responseStrategies(wireStrategies),
      });
      return recoveredStepResult(recovered, routed, error);
    }
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
    const result: StepResult = {
      content: response.content,
      toolCalls,
      usage: response.usage,
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

  const stepStream = (request: StepRequest, streamOptions?: StreamOptions): AsyncIterable<StepStreamEvent> => {
    const run = async function* (): AsyncGenerator<StepStreamEvent> {
      const adapter = await getAdapter();
      const resolved = resolveProvider(config);
      const declared = new Set((request.tools ?? []).map((tool) => tool.name));
      try {
        for await (const event of executeStepStream({
          adapter,
          model: resolved.model,
          request,
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
        // Rejections surface at stream creation OR mid-iteration (the
        // 400 lands on the first chunk read) — recover both here.
        const recovered = recoverRejection(wireStrategies, error);
        if (!recovered) throw error;
        const routed = routeRejection(recovered.rejection, {
          declared,
          ...(request.output && { accept: request.output.accept }),
          ...(request.output?.outputTool !== undefined && { outputTool: request.output.outputTool }),
          responseStrategies: responseStrategies(wireStrategies),
        });
        yield { type: 'done', result: recoveredStepResult(recovered, routed, error) };
      }
    };
    return run();
  };

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

    describe: (): SignalDescription => {
      if (typeof config.provider === 'string') {
        const entry = providerRegistry[config.provider];
        return {
          provider: config.provider,
          model: config.model ?? entry?.defaultModel,
          capabilities: resolveCapabilities(config),
        };
      }
      return {
        provider: config.provider.baseUrl,
        model: config.model ?? config.provider.model,
        capabilities: resolveCapabilities(config),
      };
    },

    // Execution — thin wrappers over the step core (src/complete.ts).
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
        { stepStream, model: resolveProvider(config).model, capabilities: resolveCapabilities(config) },
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
        { stepStream, model: resolveProvider(config).model, capabilities: resolveCapabilities(config) },
      ),

    // ─── Low-level primitives — the execution core itself ────
    step,
    stepStream,

    // ─── Embedding ────────────────────────────────────────────
    embed: (async (input: string | string[], options?: EmbedOptions): Promise<number[] | number[][]> => {
      const adapter = await getAdapter();
      if (!adapter.embed) {
        throw new SignalError('This provider does not support embedding', ErrorCode.PROVIDER_ERROR);
      }
      const resolved = resolveProvider(config);
      const response = await adapter.embed({
        model: resolved.model,
        input,
        dimensions: options?.dimensions,
      });
      if (typeof input === 'string') {
        const vector = response.embeddings[0];
        if (!vector) throw new SignalError('No embedding returned', ErrorCode.PROVIDER_ERROR);
        return vector;
      }
      return response.embeddings;
    }) as Signal<T>['embed'],

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
