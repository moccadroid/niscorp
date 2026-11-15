import { resolveTransport, type Capabilities, type Message, type ResolvedTransport } from '@niscorp/signal';
import {
  assembleContext,
  inputMessages,
  toolGuidesMessage,
  type ContextEntry,
  type Producer,
  type RunInput,
} from '../context/assemble';
import { schemaDoc } from '../context/schema-doc';
import { envelopeLooseWireSchema, envelopeWireSchema, type ResponseMode } from '../schemas/envelope.schema';
import type { ToolDefinition } from '../tool/define-tool';
import type { AgentConfig } from './define-agent';

export const responseModeOf = <TData, TDeps>(config: AgentConfig<TData, TDeps>): ResponseMode =>
  config.output?.response ?? (config.output?.schema ? 'optional' : 'required');

export const resolveAgentTransport = <TData, TDeps>(
  config: AgentConfig<TData, TDeps>,
  tools: ReadonlyArray<ToolDefinition>,
  capabilities: Capabilities,
): ResolvedTransport => {
  const outputSchema = config.output?.schema;
  const responseMode = responseModeOf(config);
  return resolveTransport(
    {
      wire: envelopeWireSchema({ ...(outputSchema && { schema: outputSchema }), responseMode }),
      looseWire: envelopeLooseWireSchema({ hasData: outputSchema !== undefined, responseMode }),
      responseMode,
      hasData: outputSchema !== undefined,
      hasTools: tools.length > 0,
      ...(config.output?.strategy && { choice: config.output.strategy }),
      ...(config.output?.forceTool && { forceTool: true }),
    },
    capabilities,
  );
};

export type PrefixInput<TData, TDeps> = {
  config: AgentConfig<TData, TDeps>;
  resolved: ResolvedTransport;
  tools: ReadonlyArray<ToolDefinition>;
  producers: ReadonlyArray<ContextEntry | Producer<TDeps>>;
  deps: TDeps;
  input: RunInput;
};

export const assemblePrefix = async <TData, TDeps>(prefix: PrefixInput<TData, TDeps>): Promise<Message[]> => {
  const { config, resolved, tools, input, deps } = prefix;
  const outputSchema = config.output?.schema;
  // Tool guides, schema doc and finish protocol are fixed for the life of an
  // agent, so they go ahead of the context and producers, which are not: a
  // provider's prefix cache stops at the first byte that changed.
  const contextMessages = await assembleContext([config.instructions, ...(config.context ?? []), ...prefix.producers], {
    deps,
    input,
    agent: { id: config.id, ...(config.description !== undefined && { description: config.description }) },
  });
  const doc = config.output?.doc ?? 'auto';
  const docMessage: Message[] =
    resolved.injectSchemaDoc && doc !== 'off' && outputSchema
      ? [{ role: 'system', content: typeof doc === 'string' && doc !== 'auto' ? doc : schemaDoc(outputSchema) }]
      : [];
  // `instructions` stays first: a provider that special-cases a leading
  // system turn sees the agent's identity there.
  const [identity, ...rest] = contextMessages;
  return [
    ...(identity ? [identity] : []),
    ...toolGuidesMessage(tools),
    ...docMessage,
    { role: 'system', content: resolved.finishProtocol },
    ...rest,
    ...inputMessages(input),
  ];
};
