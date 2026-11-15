import type { Message, StepToolDescriptor, Capabilities } from '@niscorp/signal';
import type { OutputStrategy } from '../types';
import { estimateTokens, type RunInput } from '../context/assemble';
import { buildToolDescriptor } from '../loop/loop';
import { trustErased } from '../utils/trust';
import type { AgentDefinition } from './define-agent';
import type { RunOptions } from './run';
import { assemblePrefix, resolveAgentTransport } from './prefix';

export type ResolvedPreview = {
  strategy: OutputStrategy;
  respondDetail?: 'full' | 'loose' | 'permissive';
  messages: Message[];
  tools: StepToolDescriptor[];
  estimatedTokens: number;
};

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
  const allTools = [...(config.tools ?? []), ...(options?.tools ?? [])];
  const resolved = resolveAgentTransport(config, allTools, llm ? llm.describe().capabilities : FALLBACK_CAPABILITIES);
  const messages = await assemblePrefix({
    config,
    resolved,
    tools: allTools,
    producers: options?.producers ?? [],
    deps: trustErased<TDeps>(options?.deps),
    input,
  });
  const tools: StepToolDescriptor[] = [
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
