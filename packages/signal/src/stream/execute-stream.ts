import type { ZodType } from 'zod';
import type {
  Message, Tool, Capabilities, SignalOptions, SignalMeta, ToolCallRecord,
  StreamEvent, StreamOptions, ProviderAdapter, ProviderRequest, ProviderStreamDelta,
} from '../types';
import { SignalError, ErrorCode } from '../errors';
import { selectStructuredOutputStrategy, applyStructuredOutput } from '../strategy/structured-output';
import { selectToolCallingStrategy, toolsToProviderFormat } from '../strategy/tool-calling';
import { asOutput } from '../output-trust';

// ═══════════════════════════════════════════════════════════
// executeStream — the async generator behind signal.stream()
// ═══════════════════════════════════════════════════════════

export type ExecuteStreamConfig = {
  adapter: ProviderAdapter;
  model: string;
  messages: Message[];
  schema?: ZodType;
  tools?: Tool[];
  capabilities: Capabilities;
  retries: number;
  options?: SignalOptions;
  streamOptions?: StreamOptions;
  onRetry?: (error: Error, attempt: number) => void;
  onToolCall?: (name: string, args: unknown) => void;
};

export async function* executeStream<T>(
  config: ExecuteStreamConfig,
): AsyncGenerator<StreamEvent<T>> {
  const start = Date.now();
  const allToolCalls: ToolCallRecord[] = [];
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let retryCount = 0;

  const messages: Message[] = [...config.messages];
  const request = buildRequest(config, messages);

  // Outer retry loop: stream → collect → validate → maybe retry
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    let contentBuffer = '';
    let finishReason = 'unknown';
    const assembledToolCalls = new Map<number, { id: string; name: string; args: string }>();

    const streamRequest = attempt === 0 ? request : buildRequest(config, messages);
    const abortSignal = config.streamOptions?.signal;

    for await (const delta of config.adapter.chatStream(streamRequest)) {
      if (abortSignal?.aborted) {
        yield { type: 'error', error: new SignalError('Stream aborted', ErrorCode.PROVIDER_ERROR), recovered: false };
        return;
      }

      switch (delta.type) {
        case 'text':
          contentBuffer += delta.text;
          yield { type: 'text', text: delta.text };
          break;
        case 'tool_call':
          assembleToolCall(assembledToolCalls, delta);
          break;
        case 'usage':
          totalUsage = {
            inputTokens: totalUsage.inputTokens + delta.inputTokens,
            outputTokens: totalUsage.outputTokens + delta.outputTokens,
            totalTokens: totalUsage.totalTokens + delta.totalTokens,
          };
          break;
        case 'finish':
          finishReason = delta.finishReason;
          break;
      }
    }

    // Tool calls: execute and re-stream
    if (finishReason === 'tool_calls' && assembledToolCalls.size > 0 && config.tools?.length) {
      const toolExec = await executeToolCalls(
        assembledToolCalls, config.tools, allToolCalls, config.onToolCall,
      );

      messages.push({
        role: 'assistant',
        content: contentBuffer,
        toolCalls: [...assembledToolCalls.values()].map((tc) => ({
          id: tc.id, name: tc.name, args: tc.args,
        })),
      });
      for (const ev of toolExec.events) yield ev as StreamEvent<T>;
      messages.push(...toolExec.messages);

      const reRequest = buildRequest(config, messages);
      yield* streamWithToolLoop<T>({
        ...config,
        messages,
        retries: config.retries - attempt,
      }, reRequest, start, allToolCalls, totalUsage, retryCount);
      return;
    }

    // No tool calls — validate schema if present
    messages.push({ role: 'assistant', content: contentBuffer });

    if (config.schema) {
      const validationResult = validateContent(contentBuffer, config.schema);
      if (!validationResult.ok) {
        if (attempt >= config.retries) {
          yield {
            type: 'error',
            error: new SignalError(validationResult.error, ErrorCode.VALIDATION_FAILED),
            recovered: false,
          };
          return;
        }

        retryCount++;
        config.onRetry?.(new Error(validationResult.error), retryCount);

        messages.push({
          role: 'user',
          content: validationResult.correctionPrompt,
        });
        yield { type: 'retry', reason: validationResult.error, attempt: retryCount };
        continue;
      }

      // Valid — emit done
      yield makeDone<T>(validationResult.parsed as T, contentBuffer, messages, config.model, totalUsage, start, allToolCalls, retryCount);
      return;
    }

    // No schema — emit raw content as done
    yield makeDone<T>(asOutput<T>(contentBuffer), contentBuffer, messages, config.model, totalUsage, start, allToolCalls, retryCount);
    return;
  }
}

// ═══════════════════════════════════════════════════════════
// Tool loop variant — after tool execution, re-stream
// ═══════════════════════════════════════════════════════════

async function* streamWithToolLoop<T>(
  config: ExecuteStreamConfig,
  request: ProviderRequest,
  start: number,
  allToolCalls: ToolCallRecord[],
  totalUsage: { inputTokens: number; outputTokens: number; totalTokens: number },
  retryCount: number,
): AsyncGenerator<StreamEvent<T>> {
  let contentBuffer = '';
  let finishReason = 'unknown';
  const assembledToolCalls = new Map<number, { id: string; name: string; args: string }>();

  for await (const delta of config.adapter.chatStream(request)) {
    if (config.streamOptions?.signal?.aborted) {
      yield { type: 'error', error: new SignalError('Stream aborted', ErrorCode.PROVIDER_ERROR), recovered: false };
      return;
    }

    switch (delta.type) {
      case 'text':
        contentBuffer += delta.text;
        yield { type: 'text', text: delta.text };
        break;
      case 'tool_call':
        assembleToolCall(assembledToolCalls, delta);
        break;
      case 'usage':
        totalUsage = {
          inputTokens: totalUsage.inputTokens + delta.inputTokens,
          outputTokens: totalUsage.outputTokens + delta.outputTokens,
          totalTokens: totalUsage.totalTokens + delta.totalTokens,
        };
        break;
      case 'finish':
        finishReason = delta.finishReason;
        break;
    }
  }

  if (finishReason === 'tool_calls' && assembledToolCalls.size > 0 && config.tools?.length) {
    const toolExec = await executeToolCalls(
      assembledToolCalls, config.tools, allToolCalls, config.onToolCall,
    );
    const messages = [...config.messages];
    messages.push({
      role: 'assistant',
      content: contentBuffer,
      toolCalls: [...assembledToolCalls.values()].map((tc) => ({
        id: tc.id, name: tc.name, args: tc.args,
      })),
    });
    for (const ev of toolExec.events) yield ev as StreamEvent<T>;
    messages.push(...toolExec.messages);

    const nextRequest = buildRequest({ ...config, messages }, messages);
    yield* streamWithToolLoop<T>(
      { ...config, messages }, nextRequest, start, allToolCalls, totalUsage, retryCount,
    );
    return;
  }

  const messages = [...config.messages, { role: 'assistant' as const, content: contentBuffer }];

  if (config.schema) {
    const validationResult = validateContent(contentBuffer, config.schema);
    if (!validationResult.ok) {
      yield {
        type: 'error',
        error: new SignalError(validationResult.error, ErrorCode.VALIDATION_FAILED),
        recovered: false,
      };
      return;
    }
    yield makeDone<T>(validationResult.parsed as T, contentBuffer, messages, config.model, totalUsage, start, allToolCalls, retryCount);
    return;
  }

  yield makeDone<T>(asOutput<T>(contentBuffer), contentBuffer, messages, config.model, totalUsage, start, allToolCalls, retryCount);
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

const buildRequest = (config: ExecuteStreamConfig, messages: Message[]): ProviderRequest => {
  let request: ProviderRequest = { model: config.model, messages, options: config.options };

  if (config.schema && !config.tools?.length) {
    // For streaming, always use prompt_only strategy. Provider-side
    // json_mode/json_schema can cause buffering (the provider validates
    // JSON completeness before flushing), which defeats streaming.
    // Zod validates at end-of-stream regardless.
    request = applyStructuredOutput(request, config.schema, 'prompt_only');
  }

  if (config.tools?.length) {
    const toolStrategy = selectToolCallingStrategy(config.capabilities);
    if (toolStrategy === 'native') {
      request = { ...request, tools: toolsToProviderFormat(config.tools) };
    }
  }

  return request;
};

type AssembledToolCall = { id: string; name: string; args: string };

const assembleToolCall = (
  map: Map<number, AssembledToolCall>,
  delta: Extract<ProviderStreamDelta, { type: 'tool_call' }>,
): void => {
  let tc = map.get(delta.index);
  if (!tc) {
    tc = { id: delta.id ?? '', name: delta.name ?? '', args: '' };
    map.set(delta.index, tc);
  }
  if (delta.id) tc.id = delta.id;
  if (delta.name) tc.name = delta.name;
  if (delta.argsFragment) tc.args += delta.argsFragment;
};

type ToolExecResult = {
  events: StreamEvent<unknown>[];
  messages: Message[];
};

const executeToolCalls = async (
  assembled: Map<number, AssembledToolCall>,
  tools: Tool[],
  allToolCalls: ToolCallRecord[],
  onToolCall?: (name: string, args: unknown) => void,
): Promise<ToolExecResult> => {
  const events: StreamEvent<unknown>[] = [];
  const messages: Message[] = [];

  for (const [, tc] of assembled) {
    const tool = tools.find((t) => t.name === tc.name);
    if (!tool) {
      events.push({ type: 'tool_end', name: tc.name, result: { error: `Unknown tool: ${tc.name}` } });
      messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: `Error: Unknown tool "${tc.name}"` });
      continue;
    }

    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(tc.args);
      parsedArgs = tool.inputSchema.parse(parsedArgs);
    } catch (error) {
      events.push({ type: 'tool_end', name: tc.name, result: { error: String(error) } });
      messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: `Error: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }

    onToolCall?.(tc.name, parsedArgs);
    events.push({ type: 'tool_start', name: tc.name, args: parsedArgs });

    const execStart = Date.now();
    try {
      const result = await tool.execute(parsedArgs);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      const durationMs = Date.now() - execStart;
      allToolCalls.push({ name: tc.name, args: parsedArgs, result, durationMs });
      events.push({ type: 'tool_end', name: tc.name, result });
      messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: resultStr });
    } catch (error) {
      const durationMs = Date.now() - execStart;
      const errMsg = error instanceof Error ? error.message : String(error);
      allToolCalls.push({ name: tc.name, args: parsedArgs, result: { error: errMsg }, durationMs });
      events.push({ type: 'tool_end', name: tc.name, result: { error: errMsg } });
      messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: `Error: ${errMsg}` });
    }
  }

  return { events, messages };
};

type ValidationOk = { ok: true; parsed: unknown };
type ValidationFail = { ok: false; error: string; correctionPrompt: string };

const validateContent = (content: string, schema: ZodType): ValidationOk | ValidationFail => {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return {
      ok: false,
      error: 'Response is not valid JSON',
      correctionPrompt: 'Your response was not valid JSON. Please respond with valid JSON only.',
    };
  }

  const result = schema.safeParse(json);
  if (result.success) return { ok: true, parsed: result.data };

  const errorDetails = result.error.issues
    .map((i) => `  ${i.path.join('.') || 'root'}: ${i.message}`)
    .join('\n');

  return {
    ok: false,
    error: `Validation failed:\n${errorDetails}`,
    correctionPrompt: `Your response was valid JSON but failed validation:\n${errorDetails}\n\nPlease fix these issues and try again.`,
  };
};

const makeDone = <T>(
  response: T,
  _content: string,
  history: Message[],
  model: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  start: number,
  toolCalls: ToolCallRecord[],
  retries: number,
): StreamEvent<T> => ({
  type: 'done',
  response,
  history,
  meta: {
    model,
    usage,
    durationMs: Date.now() - start,
    retries,
    toolCalls,
    provider: { raw: null, errors: [] },
  },
});
