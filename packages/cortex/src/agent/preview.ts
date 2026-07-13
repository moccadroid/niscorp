// ═══════════════════════════════════════════════════════════
// preview — the exact messages and tools a run would send
// ═══════════════════════════════════════════════════════════
//
// Runs the context functions and strategy resolution without a
// model call. Anything you can't explain in the preview, the
// model can't either. Shows the REAL exit-tool params and the
// resolved strategy, so output plumbing is never mystery-meat.

import { resolveTransport } from '@niscorp/signal';
import type { Message, StepToolDescriptor, Capabilities } from '@niscorp/signal';
import type { OutputStrategy } from '../types';
import {
  assembleContext,
  estimateTokens,
  inputMessages,
  toolGuidesMessage,
  type ContextEntry,
  type Producer,
  type ProducerArgs,
  type RunInput,
} from '../context/assemble';
import { schemaDoc } from '../context/schema-doc';
import { buildToolDescriptor } from '../loop/loop';
import { envelopeLooseWireSchema, envelopeWireSchema } from '../schemas/envelope.schema';
import { trustErased } from '../utils/trust';
import type { AgentDefinition } from './define-agent';
import type { RunOptions } from './run';

export type ResolvedPreview = {
  strategy: OutputStrategy;
  respondDetail?: 'full' | 'loose' | 'permissive';
  messages: Message[];
  tools: StepToolDescriptor[];
  estimatedTokens: number;
};

// Without an llm to describe(), resolution assumes the most
// conservative provider — which resolves to the respond strategy.
const FALLBACK_CAPABILITIES: Capabilities = {
  nativeTools: true,
  nativeJsonSchema: false,
  nativeJsonMode: false,
  toolsWithStructuredOutput: false,
  validatesToolArgs: false,
  manglesNestedToolArgs: false,
  multimodal: false,
  supportsEmbedding: false,
};

export const previewAgent = async <TData, TDeps>(
  definition: AgentDefinition<TData, TDeps>,
  input: RunInput,
  options: RunOptions<TDeps> | undefined,
): Promise<ResolvedPreview> => {
  const config = definition.config;
  const llm = options?.llm ?? config.llm;
  const capabilities = llm ? llm.describe().capabilities : FALLBACK_CAPABILITIES;
  const allTools = [...(config.tools ?? []), ...(options?.tools ?? [])];

  const outputSchema = config.output?.schema;
  const responseMode = config.output?.response ?? (outputSchema ? 'optional' : 'required');
  // The run's resolution exactly (see run.ts) — same pure function,
  // same capabilities, so the preview never explains a request that
  // would not go out.
  const resolved = resolveTransport(
    {
      wire: envelopeWireSchema({ ...(outputSchema && { schema: outputSchema }), responseMode }),
      looseWire: envelopeLooseWireSchema({ hasData: outputSchema !== undefined, responseMode }),
      responseMode,
      hasData: outputSchema !== undefined,
      hasTools: allTools.length > 0,
      ...(config.output?.strategy && { choice: config.output.strategy }),
      ...(config.output?.forceTool && { forceTool: true }),
    },
    capabilities,
  );

  const deps = trustErased<TDeps>(options?.deps);
  const args: ProducerArgs<TDeps> = {
    deps,
    input,
    agent: { id: config.id, ...(config.description !== undefined && { description: config.description }) },
  };
  // Mirrors the run's prefix order exactly (see run.ts) so the preview's
  // token estimate is honest: instructions → context → run producers →
  // tool guides → schema doc → finish protocol → input.
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
  const messages = [
    ...contextMessages,
    ...toolGuidesMessage(allTools),
    ...docMessage,
    finishMessage,
    ...inputMessages(input),
  ];

  const tools: StepToolDescriptor[] = [
    // The run's own builder — the preview shows the model-visible NAME,
    // not the id, or it would explain a request that never goes out.
    ...allTools.map(buildToolDescriptor),
    ...(resolved.respondDescriptor ? [resolved.respondDescriptor] : []),
  ];

  return {
    strategy: resolved.transport,
    ...(resolved.respondDetail && { respondDetail: resolved.respondDetail }),
    messages,
    tools,
    estimatedTokens: estimateTokens(messages),
  };
};
