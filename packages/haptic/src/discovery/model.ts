import { z } from 'zod';
import { REASONING_EFFORTS, type createSignal } from '@niscorp/signal';
import {
  defineAgent,
  duration,
  outputRetries,
  stepCount,
  type AgentDefinition,
} from '@niscorp/cortex';
import { MAX_NATIVE_TIMEOUT_MS } from '../engine/control.js';
import type { JsonValue, Operation } from '../engine/contracts.js';
import { defineOperation } from '../engine/operation.js';
import { freezeOwned } from '../engine/json.js';
import { observeAuthorOutput, type AuthorOutputSource } from './author-output.js';
import { OutputRejectionsSchema, type OutputRejections } from './output-rejection.js';
import { ModelResultSchema } from './model-result.schema.js';
import {
  ModelTransportSchema,
  type ModelTransport,
  type ProviderBlock,
} from './model-transport.js';

export const DiscoverySettingsSchema = z
  .object({
    model: z.string().min(1),
    reasoningEffort: z.enum(REASONING_EFFORTS),
    outputStrategy: z.enum(['auto', 'respond', 'native', 'emit']),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    maxTokens: z.number().int().positive(),
    maxSteps: z.number().int().positive(),
    outputAttempts: z.number().int().positive(),
    maxMs: z.number().int().positive().max(MAX_NATIVE_TIMEOUT_MS),
  })
  .strict();

export const DiscoveryModelInputSchema = z
  .object({
    instructions: z.string().min(1),
    messages: z.array(
      z
        .object({
          role: z.enum(['user', 'system', 'assistant']),
          content: z.string(),
        })
        .strict(),
    ),
    settings: DiscoverySettingsSchema,
    maxInputBytes: z.number().int().positive(),
  })
  .strict();

export type DiscoveryRecord = (event: JsonValue) => void;
export type ModelOperationOptions = {
  client: ReturnType<typeof createSignal>;
  maxJsonDepth?: number;
  record?: DiscoveryRecord;
  outputRejections?: OutputRejections;
  modelTransport?: ModelTransport;
  providerBlockFor?: (signal: AbortSignal) => ProviderBlock | null;
};

/** One owned invocation configuration for every discovery and search model job. */
export const createModelOperationOptions = (input: {
  client: ReturnType<typeof createSignal>;
  profile: {
    engine: { maxJsonDepth: number };
    outputRejections: OutputRejections;
    modelTransport: ModelTransport;
  };
  record?: DiscoveryRecord;
  providerBlockFor?: (signal: AbortSignal) => ProviderBlock | null;
}): ModelOperationOptions =>
  Object.freeze({
    client: input.client,
    maxJsonDepth: input.profile.engine.maxJsonDepth,
    outputRejections: freezeOwned(OutputRejectionsSchema.parse(input.profile.outputRejections)),
    modelTransport: freezeOwned(ModelTransportSchema.parse(input.profile.modelTransport)),
    providerBlockFor: input.providerBlockFor,
    record: input.record,
  });

export const createModelOperation = (
  schema: z.ZodType,
  options: ModelOperationOptions,
): Operation =>
  defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: DiscoveryModelInputSchema,
    output: ModelResultSchema,
    run(request, { signal }) {
      return runDiscoveryModel({
        ...options,
        request,
        schema,
        signal,
      });
    },
  });

const json = (value: unknown): JsonValue => z.json().parse(JSON.parse(JSON.stringify(value)));

export const runDiscoveryModel = async <Data>(
  options: ModelOperationOptions & {
    request: z.infer<typeof DiscoveryModelInputSchema>;
    schema: z.ZodType<Data>;
    doc?: string;
    signal: AbortSignal;
  },
): Promise<JsonValue> => {
  const agent = defineAgent({
    id: 'discovery',
    instructions: options.request.instructions,
    output: {
      schema: options.schema,
      ...(options.doc === undefined ? {} : { doc: options.doc }),
    },
  });
  return runModelAgent({ ...options, agent });
};

/** Configure execution allowances without replacing the owning agent's contract. */
export const runModelAgent = async <Data>(
  options: ModelOperationOptions & {
    request: Omit<z.infer<typeof DiscoveryModelInputSchema>, 'instructions'>;
    agent: AgentDefinition<Data>;
    signal: AbortSignal;
  },
): Promise<JsonValue> => {
  const { request, record } = options;
  const callerSignal = options.signal;
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(request.settings.maxMs)]);
  const evidence: { sources: AuthorOutputSource[]; usageUnavailable: boolean } = {
    sources: [],
    usageUnavailable: false,
  };
  let providerBlock: ProviderBlock | undefined;
  const agent = defineAgent({
    ...options.agent.config,
    output: { ...options.agent.config.output, strategy: request.settings.outputStrategy },
    stopWhen: [
      stepCount(request.settings.maxSteps),
      outputRetries(request.settings.outputAttempts),
      duration(request.settings.maxMs),
    ],
  });
  const llm = observeAuthorOutput(
    options.client.model(request.settings.model).options({
      reasoningEffort: request.settings.reasoningEffort,
      temperature: request.settings.temperature,
      topP: request.settings.topP,
      maxTokens: request.settings.maxTokens,
    }),
    (sources) => {
      evidence.sources = sources;
    },
    request.maxInputBytes,
    options.outputRejections && {
      rules: options.outputRejections,
      record: (value) => record?.({ kind: 'provider-output-rejection', value: json(value) }),
    },
    () => {
      evidence.usageUnavailable = true;
    },
    options.modelTransport && {
      policy: options.modelTransport,
      receive: (error) => {
        providerBlock = error;
      },
      observed: options.providerBlockFor,
    },
  );
  if (record)
    record({ kind: 'author-preview', value: json(await agent.preview(request.messages, { llm })) });
  const run = agent.run(request.messages, {
    llm,
    signal,
    onEvent(event) {
      if (event.type === 'step-start') evidence.sources = [];
      if (
        event.type !== 'model-delta' &&
        event.type !== 'output-delta' &&
        event.type !== 'output-partial'
      )
        record?.({ kind: 'cortex', value: json(event) });
    },
  });
  const result = await run.result;
  callerSignal.throwIfAborted();
  const expired = signal.aborted;
  return {
    ok: result.ok && !providerBlock && !expired,
    decision: result.ok && !providerBlock && !expired ? json(result.output.data) : null,
    error:
      providerBlock ??
      (expired
        ? {
            code: 'MODEL_TIME_LIMIT',
            message: 'The model invocation exhausted its configured time allowance.',
          }
        : result.ok
          ? null
          : { code: result.error.code, message: result.error.message }),
    meta: json({
      ...result.meta,
      usage: {
        ...result.meta.usage,
        reported: result.meta.usage.reported && !evidence.usageUnavailable,
      },
    }),
    rawSources: json(evidence.sources),
  };
};
