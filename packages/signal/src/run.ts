import { z, type ZodType } from 'zod';
import { SignalError, ErrorCode } from './errors';
import { bareSchemaPrompt, bareSchemaCorrection } from './transport/protocol';
import { asOutput } from './output-trust';
import type {
  Capabilities,
  Message,
  SignalMeta,
  SignalOptions,
  SignalResult,
  StepRequest,
  StepResult,
  StepStreamEvent,
  StreamEvent,
  StreamOptions,
  Tool,
  ToolCallRecord,
} from './types';

// ═══════════════════════════════════════════════════════════
// The high-level loop — complete()/stream() as wrappers over step
// ═══════════════════════════════════════════════════════════
//
// ONE pipeline: the same step/stepStream seam cortex uses, so the wire
// layer (repairs, routing, recovery) and the same acceptance gating
// serve both. The schema here is the caller's BARE schema — it rides
// `output.accept` for routing and, when no native grammar exists, the
// prompt (transport/protocol.ts). runStream is the core; runComplete
// drains it. Request shape is immutable for the life of a run.

export type RunDeps = {
  stepStream: (request: StepRequest, options?: StreamOptions) => AsyncIterable<StepStreamEvent>;
  model: string;
  capabilities: Capabilities;
};

export type RunSpec = {
  messages: Message[];
  schema?: ZodType | undefined;
  tools?: Tool[] | undefined;
  retries: number;
  options?: SignalOptions | undefined;
  streamOptions?: StreamOptions | undefined;
  onRetry?: ((error: Error, attempt: number) => void) | undefined;
  onToolCall?: ((name: string, args: unknown) => void) | undefined;
};

const MAX_TOOL_TURNS = 10;

const ZERO = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const toJsonSchema = (schema: ZodType): Record<string, unknown> =>
  z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;

// The one request shape for the whole run.
const buildRequest = (spec: RunSpec, caps: Capabilities): Omit<StepRequest, 'messages'> => {
  const tools = spec.tools ?? [];
  if (tools.length > 0 && !caps.nativeTools) {
    throw new SignalError(
      'This provider has no native tool calling (capabilities.nativeTools) — tools are unavailable here.',
      ErrorCode.PROVIDER_ERROR,
    );
  }
  const descriptors = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toJsonSchema(tool.inputSchema),
  }));
  const grammarViable =
    spec.schema !== undefined &&
    caps.nativeJsonSchema &&
    (tools.length === 0 || caps.toolsWithStructuredOutput);
  return {
    ...(descriptors.length > 0 && { tools: descriptors }),
    ...(spec.schema && { output: { accept: spec.schema } }),
    ...(grammarViable && spec.schema
      ? {
          responseFormat: {
            type: 'json_schema' as const,
            jsonSchema: { name: 'output', strict: false, schema: toJsonSchema(spec.schema) },
          },
        }
      : spec.schema !== undefined && caps.nativeJsonMode && tools.length === 0
        ? { responseFormat: { type: 'json_object' as const } }
        : {}),
    ...(spec.options && { options: spec.options }),
  };
};

const buildMeta = (
  model: string,
  usage: typeof ZERO,
  start: number,
  retries: number,
  toolCalls: ToolCallRecord[],
  raws: unknown[],
): SignalMeta => ({
  model,
  usage,
  durationMs: Date.now() - start,
  retries,
  toolCalls,
  provider: { raw: raws.length === 1 ? raws[0] : raws, errors: [] },
});

// ───────────────────────────────────────────────────────────
// runStream — the core; every other entry point drains it
// ───────────────────────────────────────────────────────────

export async function* runStream<T>(spec: RunSpec, deps: RunDeps): AsyncGenerator<StreamEvent<T>> {
  const start = Date.now();
  const requestBase = buildRequest(spec, deps.capabilities);
  const toolMap = new Map((spec.tools ?? []).map((tool) => [tool.name, tool]));

  const messages: Message[] = [...spec.messages];
  // No grammar carries the contract → the prompt does (protocol.ts).
  if (spec.schema && requestBase.responseFormat?.type !== 'json_schema') {
    messages.push({ role: 'system', content: bareSchemaPrompt(JSON.stringify(toJsonSchema(spec.schema))) });
  }

  let usage = ZERO;
  let retries = 0;
  const records: ToolCallRecord[] = [];
  const raws: unknown[] = [];

  for (let turn = 0; turn < MAX_TOOL_TURNS + spec.retries; turn += 1) {
    let result: StepResult | undefined;
    for await (const event of deps.stepStream({ ...requestBase, messages }, spec.streamOptions)) {
      if (event.type === 'text') yield { type: 'text', text: event.text };
      if (event.type === 'done') result = event.result;
    }
    if (!result) throw new SignalError('stream ended without a done event', ErrorCode.PROVIDER_ERROR);
    usage = {
      inputTokens: usage.inputTokens + result.usage.inputTokens,
      outputTokens: usage.outputTokens + result.usage.outputTokens,
      totalTokens: usage.totalTokens + result.usage.totalTokens,
    };
    raws.push(result.raw);

    // Tool turn — execute locally, feed results back, go again.
    const calls = result.outcome?.kind === 'tool_calls' ? result.outcome.calls : spec.schema ? [] : result.toolCalls;
    if (calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: result.content,
        toolCalls: calls.map((call) => ({ id: call.id, name: call.name, args: stringify(call.args) })),
      });
      for (const call of calls) {
        spec.onToolCall?.(call.name, call.args);
        yield { type: 'tool_start', name: call.name, args: call.args };
        const tool = toolMap.get(call.name);
        const parsed = tool?.inputSchema.safeParse(call.args);
        const started = Date.now();
        let output: unknown;
        if (!tool) output = `error: unknown tool "${call.name}"`;
        else if (parsed && !parsed.success) {
          output = `error: input_invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
        } else {
          try {
            output = await tool.execute(parsed?.data);
          } catch (cause) {
            output = `error: ${cause instanceof Error ? cause.message : String(cause)}`;
          }
        }
        records.push({ name: call.name, args: call.args, result: output, durationMs: Date.now() - started });
        yield { type: 'tool_end', name: call.name, result: output };
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: stringify(output) });
      }
      continue;
    }

    // Final turn.
    if (!spec.schema) {
      const history: Message[] = [...messages, { role: 'assistant', content: result.content }];
      yield {
        type: 'done',
        response: asOutput<T>(result.content),
        history,
        meta: buildMeta(deps.model, usage, start, retries, records, raws),
      };
      return;
    }
    if (result.outcome?.kind === 'output') {
      const parsed = spec.schema.safeParse(result.outcome.value);
      if (parsed.success) {
        const history: Message[] = [...messages, { role: 'assistant', content: result.content }];
        yield {
          type: 'done',
          response: parsed.data as T,
          history,
          meta: buildMeta(deps.model, usage, start, retries, records, raws),
        };
        return;
      }
    }

    // Invalid output — correct in-run, bounded by spec.retries.
    const evidence = result.outcome?.kind === 'failed' ? result.outcome.evidence : 'output failed schema validation';
    retries += 1;
    const error = new SignalError(`Response failed schema validation: ${evidence}`, ErrorCode.VALIDATION_FAILED);
    spec.onRetry?.(error, retries);
    if (retries > spec.retries) {
      yield { type: 'error', error, recovered: false };
      return;
    }
    yield { type: 'retry', reason: evidence, attempt: retries };
    if (result.content.length > 0) messages.push({ role: 'assistant', content: result.content });
    messages.push({ role: 'system', content: bareSchemaCorrection(evidence) });
  }
  throw new SignalError('Max tool iterations reached', ErrorCode.MAX_ITERATIONS);
}

// ───────────────────────────────────────────────────────────
// runComplete — drain the stream, return the result
// ───────────────────────────────────────────────────────────

export const runComplete = async <T>(spec: RunSpec, deps: RunDeps): Promise<SignalResult<T>> => {
  for await (const event of runStream<T>(spec, deps)) {
    if (event.type === 'done') return { response: event.response, history: event.history, meta: event.meta };
    if (event.type === 'error') throw event.error;
  }
  throw new SignalError('run ended without a result', ErrorCode.PROVIDER_ERROR);
};
