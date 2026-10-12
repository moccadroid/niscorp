import type { Message } from '@niscorp/signal';
import {
  EMPTY_USAGE,
  type CortexError,
  type RunResult,
  type SignalClient,
  type Unsubscribe,
  type Usage,
} from '../types';
import { makeError, throwConfig } from '../errors/cortex.errors';
import { createEventChannel } from '../events/channel';
import type { CortexEvent } from '../events/types';
import {
  assembleContext,
  inputMessages,
  toolGuidesMessage,
  type ContextEntry,
  type Producer,
  type ProducerArgs,
  type RunInput,
} from '../context/assemble';
import { resolveTransport, RESPOND_TOOL_NAME } from '@niscorp/signal';
import { schemaDoc } from '../context/schema-doc';
import { runLoop, type LoopState, type PendingApproval } from '../loop/loop';
import { createPartialTracker } from '../loop/partials';
import { envelopeAcceptSchema, envelopeLooseWireSchema, envelopeWireSchema } from '../schemas/envelope.schema';
import { createApprovalBridge } from '../gates/approval';
import { policyGate } from '../gates/policy';
import type { ToolGate, ToolResultHook } from '../gates/types';
import type { ToolDefinition } from '../tool/define-tool';
import { DEFAULT_STOP_CONDITIONS } from '../gates/stop';
import { newRunId } from '../utils/id';
import { trustErased } from '../utils/trust';
import type { AgentDefinition } from './define-agent';

export type RunOptions<TDeps> = {
  llm?: SignalClient;
  tools?: ReadonlyArray<ToolDefinition>;
  producers?: ReadonlyArray<ContextEntry | Producer<TDeps>>;
  gates?: ReadonlyArray<ToolGate<TDeps>>;
  onToolResult?: ReadonlyArray<ToolResultHook<TDeps>>;
  signal?: AbortSignal;
  // Subscribed before run-start is emitted; a listener added on the handle misses it.
  onEvent?: (event: CortexEvent) => void;
  agentPath?: ReadonlyArray<string>;
} & (undefined extends TDeps ? { deps?: TDeps } : { deps: TDeps });

export type RunSnapshot = {
  version: 1;
  runId: string;
  agentId: string;
  input: RunInput;
  messages: Message[];
  steps: number;
  usage: Usage;
  outputRetries: number;
  elapsedMs: number;
  pending?: PendingApproval;
};

export type RunHandle<TData> = {
  runId: string;
  agentPath: ReadonlyArray<string>;
  events: AsyncIterable<CortexEvent>;
  onEvent: (listener: (event: CortexEvent) => void) => Unsubscribe;
  result: Promise<RunResult<TData>>;
  approve: (approvalId: string, options?: { args?: unknown }) => void;
  deny: (approvalId: string, reason?: string) => void;
  snapshot: () => RunSnapshot;
  abort: (reason?: string) => void;
};

type Wiring<TData, TDeps> = {
  definition: AgentDefinition<TData, TDeps>;
  input: RunInput;
  options: RunOptions<TDeps> | undefined;
  runId: string;
  seeded?: { messages: Message[]; steps: number; usage: Usage; outputRetries: number; elapsedMs: number; pending?: PendingApproval };
};

const wireRun = <TData, TDeps>(wiring: Wiring<TData, TDeps>): RunHandle<TData> => {
  const { definition, input, options } = wiring;
  const config = definition.config;

  const llm = options?.llm ?? config.llm;
  if (!llm) throwConfig(`agent "${config.id}" has no llm — set config.llm or pass options.llm`);

  // Ids and names share one namespace: the loop's lookup holds each tool under both.
  const tools = [...(config.tools ?? []), ...(options?.tools ?? [])];
  const taken = new Set<string>();
  for (const tool of tools) {
    for (const key of tool.config.name === tool.config.id
      ? [tool.config.id]
      : [tool.config.id, tool.config.name]) {
      if (taken.has(key)) throwConfig(`duplicate tool id/name "${key}" on run of "${config.id}"`);
      taken.add(key);
    }
  }

  const outputSchema = config.output?.schema;
  const responseMode = config.output?.response ?? (outputSchema ? 'optional' : 'required');
  const resolved = resolveTransport(
    {
      wire: envelopeWireSchema({ ...(outputSchema && { schema: outputSchema }), responseMode }),
      looseWire: envelopeLooseWireSchema({ hasData: outputSchema !== undefined, responseMode }),
      responseMode,
      hasData: outputSchema !== undefined,
      hasTools: tools.length > 0,
      ...(config.output?.strategy && { choice: config.output.strategy }),
      ...(config.output?.forceTool && { forceTool: true }),
    },
    llm.describe().capabilities,
  );
  if (resolved.respondDescriptor && taken.has(RESPOND_TOOL_NAME)) {
    throwConfig(`agent "${config.id}": a tool named "respond" collides with the transport's exit tool`);
  }
  const accept = envelopeAcceptSchema({ ...(outputSchema && { schema: outputSchema }), responseMode });

  const agentPath = options?.agentPath ? [...options.agentPath, config.id] : [config.id];
  const channel = createEventChannel(wiring.runId, agentPath);
  if (options?.onEvent) channel.onEvent(options.onEvent);
  const approvals = createApprovalBridge();

  const controller = new AbortController();
  // Never handed to controller.abort(): the reason would become what a tool's
  // ctx.signal aborts with, and a tool, or the fetch it started, that tells an
  // abort by its AbortError would no longer see one.
  let abortReason: string | undefined;
  const externalSignal = options?.signal;
  const onExternalAbort = (): void => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  // RunArgs makes options, and deps with them, required unless TDeps admits undefined.
  const deps = trustErased<TDeps>(options?.deps);

  const state: LoopState = {
    messages: wiring.seeded ? [...wiring.seeded.messages] : [],
    steps: wiring.seeded?.steps ?? 0,
    usage: wiring.seeded?.usage ?? EMPTY_USAGE,
    outputRetries: wiring.seeded?.outputRetries ?? 0,
    startedAt: Date.now(),
    elapsedBase: wiring.seeded?.elapsedMs ?? 0,
  };

  const gates: ReadonlyArray<ToolGate<TDeps>> = [
    ...(config.policy ? [policyGate(config.policy)] : []),
    ...(config.toolGates ?? []),
    ...(options?.gates ?? []),
  ];

  const partials = createPartialTracker({
    wireSchema: envelopeWireSchema({
      ...(outputSchema && { schema: outputSchema }),
      responseMode: resolved.responseMode,
    }),
    emit: (partial) => channel.emit({ type: 'output-partial', output: partial }),
  });

  const errorContext = { runId: wiring.runId, agentPath };

  const result: Promise<RunResult<TData>> = (async () => {
    channel.emit({ type: 'run-start', input });
    let outcome: RunResult<TData>;
    try {
      if (!wiring.seeded) {
        const args: ProducerArgs<TDeps> = {
          deps,
          input,
          agent: { id: config.id, ...(config.description !== undefined && { description: config.description }) },
        };
        // Tool guides, schema doc and finish protocol are fixed for the life of an
        // agent, so they go ahead of the context and producers, which are not: a
        // provider's prefix cache stops at the first byte that changed.
        const items: ReadonlyArray<ContextEntry | Producer<TDeps>> = [
          config.instructions,
          ...(config.context ?? []),
          ...(options?.producers ?? []),
        ];
        const contextMessages = await assembleContext(items, args);
        const doc = config.output?.doc ?? 'auto';
        const docMessage: Message[] =
          resolved.injectSchemaDoc && doc !== 'off' && outputSchema
            ? [{ role: 'system', content: typeof doc === 'string' && doc !== 'auto' ? doc : schemaDoc(outputSchema) }]
            : [];
        const finishMessage: Message = { role: 'system', content: resolved.finishProtocol };
        // `instructions` stays first: a provider that special-cases a leading
        // system turn sees the agent's identity there.
        const [identity, ...rest] = contextMessages;
        state.messages = [
          ...(identity ? [identity] : []),
          ...toolGuidesMessage(tools),
          ...docMessage,
          finishMessage,
          ...rest,
          ...inputMessages(input),
        ];
      }

      outcome = await runLoop<TData, TDeps>({
        runId: wiring.runId,
        agentId: config.id,
        agentPath,
        llm,
        transport: config.transport ?? 'stream',
        tools,
        resolved,
        accept,
        ...(outputSchema && { outputSchema }),
        ...(config.output?.validate && { outputValidate: config.output.validate }),
        gates,
        resultHooks: [...(config.onToolResult ?? []), ...(options?.onToolResult ?? [])],
        ...(config.prepareStep && { prepareStep: config.prepareStep }),
        stopWhen: config.stopWhen ?? DEFAULT_STOP_CONDITIONS,
        ...(config.policy?.approvalTimeoutMs !== undefined && {
          approvalTimeoutMs: config.policy.approvalTimeoutMs,
        }),
        deps,
        emit: channel.emit,
        forwardEvent: channel.forward,
        approvals,
        abort: controller.signal,
        partials,
        state,
        ...(wiring.seeded?.pending && { resumePending: wiring.seeded.pending }),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const error: CortexError = makeError('unknown', message, { ...errorContext, cause });
      outcome = {
        ok: false,
        error,
        meta: {
          usage: state.usage,
          strategy: resolved.transport,
          steps: state.steps,
          outputRetries: state.outputRetries,
          elapsedMs: state.elapsedBase + (Date.now() - state.startedAt),
        },
      };
    }
    if (!outcome.ok && outcome.error.code === 'aborted' && abortReason !== undefined) {
      outcome = { ...outcome, error: { ...outcome.error, cause: abortReason } };
    }
    channel.emit({ type: 'run-end', result: outcome, meta: outcome.meta });
    channel.close();
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    return outcome;
  })();

  return {
    runId: wiring.runId,
    agentPath,
    events: channel.events,
    onEvent: channel.onEvent,
    result,
    approve: approvals.approve,
    deny: approvals.deny,
    snapshot: (): RunSnapshot => ({
      version: 1,
      runId: wiring.runId,
      agentId: config.id,
      input,
      messages: [...state.messages],
      steps: state.steps,
      usage: state.usage,
      outputRetries: state.outputRetries,
      elapsedMs: state.elapsedBase + (Date.now() - state.startedAt),
      ...(state.pending && { pending: state.pending }),
    }),
    abort: (reason?: string): void => {
      if (!controller.signal.aborted) abortReason = reason;
      controller.abort();
    },
  };
};

export const createRun = <TData, TDeps>(
  definition: AgentDefinition<TData, TDeps>,
  input: RunInput,
  options: RunOptions<TDeps> | undefined,
): RunHandle<TData> => wireRun({ definition, input, options, runId: newRunId() });

export const resumeRun = <TData, TDeps>(
  definition: AgentDefinition<TData, TDeps>,
  snapshot: RunSnapshot,
  ...args: undefined extends TDeps ? [options?: RunOptions<TDeps>] : [options: RunOptions<TDeps>]
): RunHandle<TData> => {
  if (snapshot.agentId !== definition.agentId) {
    throwConfig(`snapshot belongs to agent "${snapshot.agentId}", not "${definition.agentId}"`);
  }
  return wireRun({
    definition,
    input: snapshot.input,
    options: args[0],
    runId: snapshot.runId,
    seeded: {
      messages: snapshot.messages,
      steps: snapshot.steps,
      usage: snapshot.usage,
      outputRetries: snapshot.outputRetries,
      elapsedMs: snapshot.elapsedMs,
      ...(snapshot.pending && { pending: snapshot.pending }),
    },
  });
};
