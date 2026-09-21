import { type ZodType } from 'zod';
import type {
  Message, ContentPart, Tool, SignalOptions, Capabilities,
  SignalResult, StreamEvent, StepStreamEvent, StreamOptions,
  ProviderAdapter, ChatAdapter, DecisionAdapter, ProviderRequest, ProviderResponse, Rejection,
  StepRequest, StepResult, StepToolCall, CountInput,
  EmbedOptions, Questions, DecideRequest, DecideResult,
} from './types';
import type { SignalConfig, CustomProviderConfig } from './config';
import { estimateUsage } from './utils/estimate-usage';
import { SignalError, ErrorCode } from './errors';
import { providerRegistry, resolveApiKey, type ProviderEntry } from './registry';
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

  // ─── Decisions ────────────────────────────────────────────
  // decide(): typed questions about a state, each answered with a pick. One
  // request, one response — no history, no tools, no loop. The questions are
  // the schema: the result type and the acceptance gate both derive from them.
  // On a decision provider the picks come with probabilities
  // (`calibrated: true`); on a chat provider the same questions run through
  // structured output and come back as picks alone, one to two orders of
  // magnitude slower — a caller on a latency budget reads `describe().kind`.
  decide: <const Qs extends Questions>(request: DecideRequest<Qs>) => Promise<DecideResult<Qs>>;
};

// What a Signal client resolves to, without touching the network.
export type SignalDescription = {
  provider: string;              // registry name, or the custom baseUrl
  model: string | undefined;     // undefined only for custom providers with no model set
  // Which verbs exist here. A decision provider has decide() and nothing else;
  // a chat provider has every verb, decide() included, by emulation.
  kind: ProviderAdapter['kind'];
  capabilities: Capabilities;
};

// ═══════════════════════════════════════════════════════════
// Internal: resolve provider config
// ═══════════════════════════════════════════════════════════

type ResolvedProvider = {
  model: string;
  apiKey: string;
  baseUrl: string;
  adapterType: ProviderEntry['adapter'];
  // Per-provider params that ask for streamed reasoning (registry.ts). Carried
  // to the adapter, which applies them only on a streaming call the caller
  // asked reasoning of.
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

// The adapter a config names, without resolving a key — describe() and the
// capability lookup both need it and neither may throw for a missing one.
const adapterTypeOf = (config: SignalConfig): ProviderEntry['adapter'] | undefined =>
  typeof config.provider === 'string'
    ? providerRegistry[config.provider]?.adapter
    : config.provider.adapter ?? 'openai-compatible';

const kindOf = (adapterType: ProviderEntry['adapter'] | undefined): ProviderAdapter['kind'] =>
  adapterType === 'systemone' ? 'decisions' : 'chat';

// Chat capabilities. A decision provider declares none because it has none, so
// it resolves to the all-false floor.
const resolveCapabilities = (config: SignalConfig): Capabilities => {
  if (typeof config.provider === 'string') {
    const entry = providerRegistry[config.provider];
    const defaults = entry === undefined || entry.adapter === 'systemone' ? FALLBACK_CAPABILITIES : entry.capabilities;
    return { ...defaults, ...config.capabilities };
  }
  // Custom providers may declare capabilities on the provider config;
  // instance-level .capabilities() overrides still win.
  const declared = config.provider.adapter === 'systemone' ? {} : config.provider.capabilities;
  return { ...FALLBACK_CAPABILITIES, ...declared, ...config.capabilities };
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
  sent: readonly Message[],
): StepResult => ({
  content: '',
  toolCalls: routed.outcome.kind === 'tool_calls' ? routed.outcome.calls : [],
  // A rejected generation costs tokens — the provider processed the request and
  // billed for it — and the 400 body carries none. The prompt is known exactly
  // and the model's attempt is in the rejection, so this is countable rather
  // than lost. Marked unreported, because it is a reckoning.
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
  // Adapter is lazily created and cached per provider config
  let cachedAdapter: ProviderAdapter | undefined;
  let cachedAdapterKey: string | undefined;

  // Provider wire strategies — data from the registry entry (or the
  // custom provider config), resolved once. Unknown ids throw here,
  // at construction, not mid-run.
  const wireStrategies: WireStrategy[] = resolveWireStrategies(wireIdsOf(config));

  const getAdapter = async (): Promise<ProviderAdapter> => {
    const resolved = resolveProvider(config);
    const key = `${resolved.adapterType}:${resolved.baseUrl}:${resolved.apiKey}`;
    if (cachedAdapter && cachedAdapterKey === key) return cachedAdapter;
    cachedAdapter = await createAdapter(resolved, config.client);
    cachedAdapterKey = key;
    return cachedAdapter;
  };

  // The chat verbs on a decision provider fail HERE, by name, before any
  // request is built — the provider has no endpoint that could answer them.
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

  // ─── step / stepStream — the ONE execution core ────────────
  // Everything above (complete/stream) is a wrapper over these, so the
  // wire layer serves every entry point identically.

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
      // The client's own options are the floor; a request may override them
      // field by field. `complete`/`stream` already run on config.options —
      // step used to drop them, so a configured client behaved differently
      // depending on which door the caller came through.
      ...((config.options !== undefined || request.options !== undefined) && {
        options: { ...config.options, ...request.options },
      }),
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
      return recoveredStepResult(recovered, routed, error, providerRequest.messages);
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
      // The non-streaming body always carries usage, so a zero here is a real
      // zero rather than a missing frame.
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

  const stepStream = (request: StepRequest, streamOptions?: StreamOptions): AsyncIterable<StepStreamEvent> => {
    const run = async function* (): AsyncGenerator<StepStreamEvent> {
      const adapter = await getChatAdapter('stepStream');
      const resolved = resolveProvider(config);
      const declared = new Set((request.tools ?? []).map((tool) => tool.name));
      // The client's own options are the floor here too — step() merges them and
      // stepStream must not diverge, or a configured client (reasoningEffort,
      // temperature, …) behaves differently depending on which door it came
      // through. This is the merge that carries reasoning_effort to the wire on
      // the streaming path cortex actually runs every turn through.
      const merged: StepRequest =
        config.options !== undefined || request.options !== undefined
          ? { ...request, options: { ...config.options, ...request.options } }
          : request;
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
        yield { type: 'done', result: recoveredStepResult(recovered, routed, error, request.messages) };
      }
    };
    return run();
  };

  // ─── decide — beside the execution core, not through it ────
  // A decision provider answers the questions itself and the gate checks the
  // answers against them. No wire strategy, repair or retry applies: there are
  // no bytes to repair and the model cannot be told what it got wrong.
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

  // A chat provider is asked the same questions through structured output: the
  // derived schema is the contract, so the whole complete() pipeline — native
  // grammar where it exists, the repair ladder, correction retries — serves it.
  // It returns picks and no probabilities; see DecideResult.
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
        // complete() sums what providers reported with what it had to estimate
        // and does not say which, so this total cannot be vouched for as measured.
        usage: { ...result.meta.usage, reported: false },
        durationMs: Date.now() - started,
        provider: { raw: result.meta.provider.raw },
      },
    };
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
          kind: kindOf(adapterTypeOf(config)),
          capabilities: resolveCapabilities(config),
        };
      }
      return {
        provider: config.provider.baseUrl,
        model: config.model ?? config.provider.model,
        kind: kindOf(adapterTypeOf(config)),
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
      // The usage the adapter already parsed, handed back before the vector
      // return narrows it away. After success only — a throw above never reaches
      // here — and once for both the string and array shapes.
      options?.onUsage?.(response.usage, resolved.model);
      if (typeof input === 'string') {
        const vector = response.embeddings[0];
        if (!vector) throw new SignalError('No embedding returned', ErrorCode.PROVIDER_ERROR);
        return vector;
      }
      return response.embeddings;
    }) as Signal<T>['embed'],

    // ─── Decisions ────────────────────────────────────────────
    decide: async <const Qs extends Questions>(request: DecideRequest<Qs>): Promise<DecideResult<Qs>> => {
      assertQuestions(request.questions);
      const started = Date.now();
      const adapter = await getAdapter();
      const model = resolveProvider(config).model;
      return adapter.kind === 'decisions'
        ? decideCalibrated(adapter, model, request, started)
        : decideEmulated(model, request, started);
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
