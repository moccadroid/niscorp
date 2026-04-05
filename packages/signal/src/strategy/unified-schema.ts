import { z } from 'zod';
import type { Tool, Message, ProviderAdapter, ProviderRequest, ProviderResponse } from '../types';
import type { ToolLoopResult } from '../tools/tool-loop';

// ═══════════════════════════════════════════════════════════
// Unified Schema Builder
// ═══════════════════════════════════════════════════════════

export const buildUnifiedJsonSchema = (
  tools: Tool[],
  outputSchema?: z.ZodType,
): Record<string, unknown> => {
  const outputProperties = outputSchema
    ? (z.toJSONSchema(outputSchema, { target: 'draft-7' }) as Record<string, unknown>)['properties'] ?? {}
    : { response: { type: 'string', description: 'Your response to the user' } };

  const hasTools = tools.length > 0;

  return {
    type: 'object',
    properties: {
      _action: {
        type: 'string',
        enum: hasTools ? ['call', 'respond'] : ['respond'],
        description: hasTools
          ? 'Choose "call" to execute a tool, or "respond" to give your final answer'
          : 'Always use "respond" to give your answer',
      },
      ...(hasTools && {
        tool: {
          type: 'string',
          enum: tools.map((t) => t.name),
          description: 'Tool to execute (required when _action is "call")',
        },
        args: {
          type: 'object',
          description: 'Arguments for the tool (required when _action is "call")',
          additionalProperties: true,
        },
      }),
      ...(outputProperties as Record<string, unknown>),
    },
    required: ['_action'],
    additionalProperties: false,
  };
};

// ═══════════════════════════════════════════════════════════
// System Prompt Injection
// ═══════════════════════════════════════════════════════════

const buildToolDescriptions = (tools: Tool[]): string =>
  tools.map((t) => {
    const schema = z.toJSONSchema(t.inputSchema, { target: 'draft-7' });
    return `### ${t.name}\n${t.description}\nParameters: ${JSON.stringify(schema, null, 2)}`;
  }).join('\n\n');

export const buildSystemPromptAddition = (
  tools: Tool[],
  outputSchema?: z.ZodType,
): string => {
  let addition = '';

  if (tools.length > 0) {
    addition += `\n\n## Available Tools\n\n${buildToolDescriptions(tools)}\n\n`;
    addition += `## Tool Usage\n`;
    addition += `To call a tool, respond with: { "_action": "call", "tool": "<name>", "args": { ... } }\n`;
    addition += `After receiving tool results, provide your final answer.\n`;
  }

  addition += `\n## Response Format\nYou MUST respond with valid JSON.\n`;
  addition += tools.length > 0
    ? `Either call a tool or provide your final answer with { "_action": "respond", ... }\n`
    : `Always respond with { "_action": "respond", ... }\n`;

  if (outputSchema) {
    const schema = z.toJSONSchema(outputSchema, { target: 'draft-7' });
    addition += `\nYour final response must match this schema:\n${JSON.stringify(schema, null, 2)}\n`;
  }

  return addition;
};

export const injectSystemPrompt = (messages: Message[], addition: string): Message[] => {
  const trimmed = addition.trim();
  if (!trimmed) return messages;

  const [first, ...rest] = messages;
  if (first?.role === 'system') {
    return [{ ...first, content: `${first.content}\n\n${trimmed}` }, ...rest];
  }
  return [{ role: 'system', content: trimmed }, ...messages];
};

// ═══════════════════════════════════════════════════════════
// Unified Schema Loop
// ═══════════════════════════════════════════════════════════

type UnifiedResponse = {
  _action: 'call' | 'respond';
  tool?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
};

export type UnifiedLoopConfig = {
  adapter: ProviderAdapter;
  tools: Tool[];
  maxIterations: number;
  outputSchema?: z.ZodType;
  useJsonSchema?: boolean;             // true = json_schema, false = json_object + prompt
  retries?: number;                    // max format retries (default: 2)
  onToolCall?: (name: string, args: unknown) => void;
};

export const runUnifiedSchemaLoop = async (
  request: ProviderRequest,
  config: UnifiedLoopConfig,
): Promise<ToolLoopResult> => {
  const unifiedSchema = buildUnifiedJsonSchema(config.tools, config.outputSchema);
  const systemAddition = buildSystemPromptAddition(config.tools, config.outputSchema);

  const baseMessages = injectSystemPrompt(request.messages, systemAddition);
  const internalMessages: Message[] = [];
  const toolCalls: ToolLoopResult['toolCalls'] = [];
  const providerResponses: unknown[] = [];
  const errors: ToolLoopResult['errors'] = [];
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let formatRetries = 0;
  const maxFormatRetries = config.retries ?? 2;

  for (let i = 0; i < config.maxIterations; i++) {
    const currentMessages = [...baseMessages, ...internalMessages];

    const providerRequest: ProviderRequest = {
      ...request,
      messages: currentMessages,
      responseFormat: config.useJsonSchema
        ? { type: 'json_schema', jsonSchema: { name: 'signal_response', strict: false, schema: unifiedSchema } }
        : { type: 'json_object' },
      tools: undefined, // no native tools
    };

    let response: ProviderResponse;
    try {
      response = await config.adapter.chat(providerRequest);
    } catch (error) {
      errors.push({
        code: 'provider_error',
        message: error instanceof Error ? error.message : String(error),
        recovered: false,
        raw: error,
      });
      return { content: '', messages: currentMessages, toolCalls, usage: totalUsage, providerResponses, errors };
    }

    providerResponses.push(response.raw);
    totalUsage = {
      inputTokens: totalUsage.inputTokens + response.usage.inputTokens,
      outputTokens: totalUsage.outputTokens + response.usage.outputTokens,
      totalTokens: totalUsage.totalTokens + response.usage.totalTokens,
    };

    // Parse response
    let parsed: UnifiedResponse;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      formatRetries++;
      if (formatRetries > maxFormatRetries) {
        return { content: response.content, messages: currentMessages, toolCalls, usage: totalUsage, providerResponses, errors };
      }
      errors.push({ code: 'parse_error', message: 'Response is not valid JSON', recovered: true });
      internalMessages.push(
        { role: 'assistant', content: response.content },
        { role: 'user', content: `Your response was not valid JSON. You MUST respond with valid JSON containing "_action": "call" or "_action": "respond". Try again.` },
      );
      continue;
    }

    // Handle respond
    if (parsed._action === 'respond') {
      // Strip framework fields, return the rest as content
      const { _action, tool, args, ...rest } = parsed;
      const content = Object.keys(rest).length > 0
        ? JSON.stringify(rest)
        : JSON.stringify({ response: response.content });
      return { content, messages: [...currentMessages, { role: 'assistant', content: response.content }], toolCalls, usage: totalUsage, providerResponses, errors };
    }

    // Handle call
    if (parsed._action === 'call' && parsed.tool) {
      const toolDef = config.tools.find((t) => t.name === parsed.tool);

      if (!toolDef) {
        errors.push({ code: 'tool_not_found', message: `Unknown tool: ${parsed.tool}`, recovered: true });
        internalMessages.push(
          { role: 'assistant', content: response.content },
          { role: 'user', content: `Error: Unknown tool "${parsed.tool}". Available tools: ${config.tools.map((t) => t.name).join(', ')}. Try again.` },
        );
        continue;
      }

      config.onToolCall?.(parsed.tool, parsed.args);

      const start = Date.now();
      let validatedArgs: unknown;
      try {
        validatedArgs = toolDef.inputSchema.parse(parsed.args ?? {});
      } catch (error) {
        errors.push({ code: 'tool_validation', message: `Invalid args for ${parsed.tool}`, recovered: true, raw: error });
        internalMessages.push(
          { role: 'assistant', content: response.content },
          { role: 'user', content: `Error: Invalid arguments for "${parsed.tool}": ${error instanceof Error ? error.message : String(error)}. Try again.` },
        );
        continue;
      }

      try {
        const result = await toolDef.execute(validatedArgs);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        const durationMs = Date.now() - start;
        toolCalls.push({ name: parsed.tool, args: validatedArgs, result, durationMs });
        internalMessages.push(
          { role: 'assistant', content: response.content },
          { role: 'user', content: `Tool "${parsed.tool}" result:\n${resultStr}\n\nNow either call another tool or provide your final answer with { "_action": "respond", ... }` },
        );
      } catch (error) {
        const durationMs = Date.now() - start;
        const errMsg = error instanceof Error ? error.message : String(error);
        toolCalls.push({ name: parsed.tool, args: validatedArgs, result: { error: errMsg }, durationMs });
        errors.push({ code: 'tool_execution', message: errMsg, recovered: true, raw: error });
        internalMessages.push(
          { role: 'assistant', content: response.content },
          { role: 'user', content: `Error executing "${parsed.tool}": ${errMsg}. Try a different approach or provide your answer.` },
        );
      }
      continue;
    }

    // Invalid _action
    formatRetries++;
    if (formatRetries > maxFormatRetries) {
      return { content: response.content, messages: currentMessages, toolCalls, usage: totalUsage, providerResponses, errors };
    }
    internalMessages.push(
      { role: 'assistant', content: response.content },
      { role: 'user', content: `Invalid response. "_action" must be "call" or "respond". Try again.` },
    );
  }

  // Loop exhausted
  return { content: '', messages: [...baseMessages, ...internalMessages], toolCalls, usage: totalUsage, providerResponses, errors };
};
