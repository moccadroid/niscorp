import type { Tool, ToolCallRecord, Message, ProviderAdapter, ProviderRequest } from '../types';

// ═══════════════════════════════════════════════════════════
// Native Tool Loop (for providers with nativeTools)
// ═══════════════════════════════════════════════════════════

export type ToolLoopConfig = {
  adapter: ProviderAdapter;
  tools: Tool[];
  maxIterations: number;
  onToolCall?: (name: string, args: unknown) => void;
};

export type ToolLoopResult = {
  content: string;
  messages: Message[];
  toolCalls: ToolCallRecord[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  providerResponses: unknown[];
  errors: Array<{ code: string; message: string; recovered: boolean; raw?: unknown }>;
};

export const runNativeToolLoop = async (
  request: ProviderRequest,
  config: ToolLoopConfig,
): Promise<ToolLoopResult> => {
  const messages: Message[] = [...request.messages];
  const toolCalls: ToolCallRecord[] = [];
  const providerResponses: unknown[] = [];
  const errors: ToolLoopResult['errors'] = [];
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (let i = 0; i < config.maxIterations; i++) {
    const response = await config.adapter.chat({ ...request, messages });
    providerResponses.push(response.raw);
    totalUsage = {
      inputTokens: totalUsage.inputTokens + response.usage.inputTokens,
      outputTokens: totalUsage.outputTokens + response.usage.outputTokens,
      totalTokens: totalUsage.totalTokens + response.usage.totalTokens,
    };

    // No tool calls — final response
    if (!response.toolCalls?.length) {
      messages.push({ role: 'assistant', content: response.content });
      return { content: response.content, messages, toolCalls, usage: totalUsage, providerResponses, errors };
    }

    // Append assistant message (the one that contained tool_calls — required by the API)
    messages.push({ role: 'assistant', content: response.content });

    // Execute each tool call
    for (const tc of response.toolCalls) {
      const tool = config.tools.find((t) => t.name === tc.name);
      if (!tool) {
        errors.push({ code: 'tool_not_found', message: `Unknown tool: ${tc.name}`, recovered: true });
        messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: `Error: Unknown tool "${tc.name}"` });
        continue;
      }

      config.onToolCall?.(tc.name, tc.args);

      const start = Date.now();
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(tc.args);
        parsedArgs = tool.inputSchema.parse(parsedArgs);
      } catch (error) {
        errors.push({ code: 'tool_validation', message: `Invalid args for ${tc.name}`, recovered: true, raw: error });
        messages.push({
          role: 'tool', toolCallId: tc.id, name: tc.name,
          content: `Error: Invalid arguments — ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      try {
        const result = await tool.execute(parsedArgs);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        const durationMs = Date.now() - start;
        toolCalls.push({ name: tc.name, args: parsedArgs, result, durationMs });
        messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: resultStr });
      } catch (error) {
        const durationMs = Date.now() - start;
        const errMsg = error instanceof Error ? error.message : String(error);
        toolCalls.push({ name: tc.name, args: parsedArgs, result: { error: errMsg }, durationMs });
        errors.push({ code: 'tool_execution', message: errMsg, recovered: true, raw: error });
        messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: `Error: ${errMsg}` });
      }
    }
  }

  // Loop exhausted
  return { content: '', messages, toolCalls, usage: totalUsage, providerResponses, errors };
};
