import { z } from 'zod';
import type { CortexEvent, RunHandle, SignalClient, ToolDefinition } from '@niscorp/cortex';
import type { Message } from '@niscorp/signal';
import { encoreAgent } from './agent';
import type { AnswerData } from './contract';
import { predecisionsBlock } from './predecisions';
import type { Predecisions } from './predecisions';
import { runFacts } from './run-facts';
import { writeRunTrace } from './trace-file';

// The run's input is ordered to keep a provider's prefix cache alive: the thread only grows
// at its end, and the pre-decisions, which differ every run, come after it.

export type AgentRunRequest = {
  llm: SignalClient;
  thread: readonly Message[];
  predecisions: Predecisions;
  line: string;
  tools: readonly ToolDefinition[];
  abort: AbortSignal;
  refusals: (data: AnswerData, response: string) => string[];
  onAnswer: (soFar: string) => void;
  onRetry: (why: string) => void;
  onLookup: (lookup: { state: 'looking' | 'looked'; line: string }) => void;
  trace?: { dir: string; principal: string | null; model: string };
};

export type AgentRunOutcome = {
  status: 'landed' | 'aborted' | 'failed';
  response: string;
  data: AnswerData | undefined;
  reason: string;
  ms: number;
  modelSteps: number;
  outputRetries: number;
  strategy: string;
  inputTokens: number;
  outputTokens: number;
  usageReported: boolean;
  prompt: readonly Message[];
  transcript: readonly Message[];
  lookups: string[];
};

const PartialSchema = z.object({ response: z.string().optional() }).loose();

// A model that stringifies nested args sends `context` as a string, read here before cortex decodes it.
const ArgsSchema = z.object({ fingerprint: z.string().optional(), context: z.union([z.record(z.string(), z.unknown()), z.string()]).nullish() }).loose();
const ResultSchema = z.object({ refused: z.string().optional(), failed: z.string().optional(), rows: z.array(z.unknown()).optional(), queries: z.array(z.unknown()).optional() }).loose();

const CONTEXT_SHOWN = 60;

const callLine = (toolId: string, args: unknown): string => {
  const name = toolId.split('.').at(-1) ?? toolId;
  const parsed = ArgsSchema.safeParse(args);
  const fingerprint = parsed.success ? parsed.data.fingerprint : undefined;
  const held = parsed.success ? parsed.data.context : undefined;
  const bound = typeof held === 'string' ? held : held !== undefined && held !== null && Object.keys(held).length > 0 ? JSON.stringify(held) : '';
  const context = bound === '' ? '' : ` ${bound.length > CONTEXT_SHOWN ? `${bound.slice(0, CONTEXT_SHOWN)}…` : bound}`;
  return fingerprint === undefined ? name : `${name} ${fingerprint}${context}`;
};

const outcomeWords = (result: unknown): string => {
  const parsed = ResultSchema.safeParse(result);
  if (!parsed.success) return 'done';
  if (parsed.data.refused !== undefined) return 'refused';
  if (parsed.data.failed !== undefined) return 'failed';
  if (parsed.data.rows !== undefined) return `${parsed.data.rows.length} row(s)`;
  if (parsed.data.queries !== undefined) return `${parsed.data.queries.length} read(s)`;
  return 'done';
};

export const runInput = (request: Pick<AgentRunRequest, 'thread' | 'predecisions' | 'line'>): Message[] => [...request.thread, { role: 'system', content: predecisionsBlock(request.predecisions) }, { role: 'user', content: request.line }];

export const runAgent = async (request: AgentRunRequest): Promise<AgentRunOutcome> => {
  const started = performance.now();
  const events: CortexEvent[] = [];
  const rawReply: string[] = [];
  const lookups: string[] = [];
  let prompt: readonly Message[] = [];
  let lastIssues = '';
  let handle: RunHandle<AnswerData> | undefined;

  const onEvent = (event: CortexEvent): void => {
    if (request.trace !== undefined) events.push(event);
    if (event.type === 'step-start') {
      rawReply.push('');
      if (event.step === 1) prompt = handle?.snapshot().messages ?? [];
      return;
    }
    if (event.type === 'model-delta' && event.channel === 'text') {
      rawReply[rawReply.length - 1] = `${rawReply.at(-1) ?? ''}${event.text}`;
      return;
    }
    if (event.type === 'output-partial') {
      const partial = PartialSchema.safeParse(event.output);
      if (partial.success && partial.data.response !== undefined) request.onAnswer(partial.data.response);
      return;
    }
    if (event.type === 'retry') {
      lastIssues = event.issues;
      request.onRetry(event.issues);
      return;
    }
    if (event.type === 'tool-start') {
      request.onLookup({ state: 'looking', line: callLine(event.call.toolId, event.call.args) });
      return;
    }
    if (event.type === 'tool-end') {
      const observation = event.observation;
      const words = observation.kind === 'result' ? outcomeWords(observation.result) : observation.kind === 'error' ? 'failed' : observation.kind === 'denied' ? 'denied' : 'no such tool';
      const line = `${callLine(observation.toolId, observation.args)} → ${words}`;
      lookups.push(line);
      request.onLookup({ state: 'looked', line });
    }
  };

  handle = runFacts.run({ refusals: request.refusals }, () =>
    encoreAgent.run(runInput(request), { llm: request.llm, tools: request.tools, deps: {}, signal: request.abort, onEvent }),
  );
  const result = await handle.result;
  const transcript = handle.snapshot().messages;
  if (prompt.length === 0) prompt = transcript;

  const isAborted = request.abort.aborted || (!result.ok && result.error.code === 'aborted');
  const status = result.ok && !isAborted ? 'landed' : isAborted ? 'aborted' : 'failed';
  const reason = result.ok
    ? ''
    : result.error.code === 'stopped' && result.error.stop === 'output_retries'
      ? `It could not give an answer the room would accept: ${lastIssues === '' ? result.error.message : lastIssues}`
      : result.error.message;

  if (request.trace !== undefined) {
    await writeRunTrace(request.trace.dir, {
      runId: handle.runId,
      at: new Date().toISOString(),
      principal: request.trace.principal,
      model: request.trace.model,
      status,
      prompt,
      tools: request.tools.map((tool) => tool.config.name),
      events,
      rawReply,
      transcript,
      result: result.ok ? result.output : { code: result.error.code, message: result.error.message, stop: result.error.stop, lastOutput: result.error.lastOutput },
    });
  }

  return {
    status,
    response: result.ok ? (result.output.response ?? '') : '',
    data: result.ok ? result.output.data : undefined,
    reason: isAborted ? 'The run was torn down.' : reason,
    ms: performance.now() - started,
    modelSteps: result.meta.steps,
    outputRetries: result.meta.outputRetries,
    strategy: result.meta.strategy,
    inputTokens: result.meta.usage.inputTokens,
    outputTokens: result.meta.usage.outputTokens,
    usageReported: result.meta.usage.reported,
    prompt,
    transcript,
    lookups,
  };
};
