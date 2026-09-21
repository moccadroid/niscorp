import { z } from 'zod';
import type { CortexEvent, RunHandle, SignalClient, ToolDefinition } from '@niscorp/cortex';
import type { Message } from '@niscorp/signal';
import type { RunMode } from '@encore/server/intent/intent.types';
import { encoreAgent } from './agent';
import type { AnswerData } from './contract';
import { predecisionsBlock } from './predecisions';
import type { Predecisions } from './predecisions';
import { runFacts } from './run-facts';
import { writeRunTrace } from './trace-file';

// ═══════════════════════════════════════════════════════════
// ONE RUN OF THE AGENT: a thread, this turn's pre-decisions and the operator's
// line in; an answer out — or a reason there is not one.
//
// THIS FILE HAS NO SHELL. It is handed callbacks and calls them; what they do
// to a screen is the caller's business (intent/assist.ts), and nothing under
// src/server/agent/ can reach one. `law-check` reads these files and fails the
// build if that ever stops being true.
//
// THE INPUT IS THE PROMPT'S TAIL, in the order that keeps a provider's prefix
// cache alive (DESIGN.md § The thread):
//
//     …static blocks (cortex)…  →  the thread  →  pre-decisions  →  the line
//
// The thread only ever grows at its end, so everything up to the last turn is
// byte-identical to the previous run's prompt; the pre-decisions — the one
// block that is different every time — sit after it, and the line is last,
// where a chat model expects the thing it is answering.
//
// ABORTED IS AN OUTCOME, NOT AN ERROR. A new sentence tears the run down
// mid-request; that is the room working, and it is reported as such.
// ═══════════════════════════════════════════════════════════

export type AgentRunRequest = {
  llm: SignalClient;
  mode: RunMode;
  thread: readonly Message[];
  predecisions: Predecisions;
  line: string;
  tools: readonly ToolDefinition[];
  abort: AbortSignal;
  // The admission rule, bound to this run (run-facts.ts). Empty = admitted.
  refusals: (data: AnswerData, response: string) => string[];
  // `response`, as far as it has streamed. Called per parsed partial — it is
  // the CALLER that throttles what reaches a screen.
  onAnswer: (soFar: string) => void;
  // The attempt streaming so far was rejected and will be tried again: whatever
  // `onAnswer` delivered is void.
  onRetry: (why: string) => void;
  // A tool call, as one line: what was looked up — never the rows.
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
  // The first request's messages, and the transcript as the run left it.
  prompt: readonly Message[];
  transcript: readonly Message[];
  lookups: string[];
};

const PartialSchema = z.object({ response: z.string().optional() }).loose();

const ArgsSchema = z.object({ fingerprint: z.string().optional(), context: z.string().nullish() }).loose();
const ResultSchema = z.object({ refused: z.string().optional(), failed: z.string().optional(), rows: z.array(z.unknown()).optional(), queries: z.array(z.unknown()).optional() }).loose();

const CONTEXT_SHOWN = 60;

const callLine = (toolId: string, args: unknown): string => {
  const name = toolId.split('.').at(-1) ?? toolId;
  const parsed = ArgsSchema.safeParse(args);
  const fingerprint = parsed.success ? parsed.data.fingerprint : undefined;
  const bound = parsed.success && typeof parsed.data.context === 'string' ? parsed.data.context : '';
  // One line on a card, not a payload: a long context is cut, and says so.
  const context = bound === '' ? '' : ` ${bound.length > CONTEXT_SHOWN ? `${bound.slice(0, CONTEXT_SHOWN)}…` : bound}`;
  return fingerprint === undefined ? name : `${name} ${fingerprint}${context}`;
};

// What came back, in three words. The rows themselves never leave the run.
const outcomeWords = (result: unknown): string => {
  const parsed = ResultSchema.safeParse(result);
  if (!parsed.success) return 'done';
  if (parsed.data.refused !== undefined) return 'refused';
  if (parsed.data.failed !== undefined) return 'failed';
  if (parsed.data.rows !== undefined) return `${parsed.data.rows.length} row(s)`;
  if (parsed.data.queries !== undefined) return `${parsed.data.queries.length} read(s)`;
  return 'done';
};

// The run's input, exposed so a check can hand the SAME messages to
// `agent.preview()` and read the prompt a run would send.
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
      // The first step's messages ARE the assembled prompt; later steps only
      // append to them.
      if (event.step === 1) prompt = handle?.snapshot().messages ?? [];
      return;
    }
    if (event.type === 'model-delta' && event.channel === 'text') {
      rawReply[rawReply.length - 1] = `${rawReply.at(-1) ?? ''}${event.text}`;
      return;
    }
    if (event.type === 'output-partial') {
      // solid's progressive parse of the envelope, via cortex. Best effort by
      // contract: a partial that does not parse is skipped, never an error.
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

  // Started INSIDE the run's own scope, so the agent's validator — module-level
  // and handed nothing — can find this run's admission rule (run-facts.ts).
  handle = runFacts.run({ refusals: request.refusals }, () =>
    encoreAgent.run(runInput(request), { llm: request.llm, tools: request.tools, deps: { mode: request.mode }, signal: request.abort, onEvent }),
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
      mode: request.mode,
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
