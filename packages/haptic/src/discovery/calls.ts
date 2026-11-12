import {
  defineAgent,
  type AgentConfig,
  type CortexEvent,
  type RunInput,
  type StopCondition,
} from '@niscorp/cortex';
import { createSignal, type Question } from '@niscorp/signal';
import type { ZodType } from 'zod';
import { observeAuthorOutput } from './author-output.js';
import { createModelClient, type ProviderBlock } from './model-transport.js';
import type { DiscoveryProfile, Effort } from './profile.js';

// One model question asked through a cortex agent: its answer must pass `validate` (null), or the returned text is
// sent back as the retry message.
export type AgentSpec<T> = {
  job: string;
  instructions?: string;
  schema?: ZodType<T>;
  base?: AgentConfig<T, undefined>;
  input: RunInput;
  steps: number;
  validate(data: T): string | null | Promise<string | null>;
};

// Every model call one attempt makes. Replay tests answer these from saved runs.
export interface Calls {
  agent<T>(spec: AgentSpec<T>): Promise<T | null>;
  // A Jev decision: the choice's key, the yes/no answer, or null when there is no answer.
  decide(
    job: string,
    state: Record<string, unknown>,
    name: string,
    question: Question,
  ): Promise<string | boolean | null>;
  jevLeft(): number;
  event(job: string, event: Record<string, unknown>): void;
}

export type JobUsage = {
  runs: number;
  steps: number;
  input: number;
  output: number;
  elapsedMs: number;
};
export type Usage = Record<string, JobUsage>;
export type DiscoveryEvent = { job: string; at: number; event: Record<string, unknown> };

// Why an attempt stopped before its end: the provider blocked it, or the discovery's input tokens ran out.
export class DiscoveryStop extends Error {
  constructor(
    readonly kind: 'blocked' | 'input-token-cap',
    message: string,
    readonly block: ProviderBlock | null = null,
  ) {
    super(message);
  }
}

// Input tokens of the whole discovery, shared by its attempts.
export type TokenBudget = { used: number; cap: number };

const EMPTY_REPLY = /produced no output/;

export const createCalls = (options: {
  groqKey: string;
  typesafeKey: string | null;
  profile: DiscoveryProfile;
  effort: Effort;
  budget: TokenBudget;
  signal: AbortSignal;
  usage: Usage;
  events: DiscoveryEvent[];
}): Calls => {
  const { profile, usage, events, budget } = options;
  let blocked: ProviderBlock | null = null;
  let jevCalls = 0;
  const { client, blockFor } = createModelClient({
    provider: 'groq',
    apiKey: options.groqKey,
    transport: profile.transport,
  });
  const llm = observeAuthorOutput(
    client
      .model(profile.model)
      .options({
        reasoningEffort: options.effort,
        temperature: profile.temperature,
        topP: profile.topP,
        maxTokens: profile.maxOutputTokens,
      }),
    () => {},
    profile.maxRequestBytes,
    { rules: profile.outputRejections },
    undefined,
    { policy: profile.transport, receive: (block) => (blocked = block), observed: blockFor },
  );
  const jev = options.typesafeKey
    ? createSignal('typesafe', { apiKey: options.typesafeKey })
    : null;
  const event = (job: string, body: Record<string, unknown>) =>
    events.push({ job, at: Date.now(), event: body });
  const charge = (job: string, steps: number, input: number, output: number, elapsedMs: number) => {
    const entry = (usage[job] ??= { runs: 0, steps: 0, input: 0, output: 0, elapsedMs: 0 });
    entry.runs++;
    entry.steps += steps;
    entry.input += input;
    entry.output += output;
    entry.elapsedMs += elapsedMs;
    budget.used += input;
  };
  const checkBudget = () => {
    if (budget.used >= budget.cap)
      throw new DiscoveryStop(
        'input-token-cap',
        `the discovery used ${budget.used} input tokens; the cap is ${budget.cap}`,
      );
  };

  return {
    event,
    jevLeft: () => (jev ? Math.max(0, profile.maxJevCalls - jevCalls) : 0),

    async agent<T>(spec: AgentSpec<T>): Promise<T | null> {
      checkBudget();
      // An empty reply from the provider is not an answer: it does not use up one of the model's tries.
      let empty = 0;
      const answers: StopCondition = (progress) =>
        progress.steps >= spec.steps + Math.min(empty, spec.steps)
          ? {
              stop: 'steps',
              message: `step limit reached (${spec.steps} answers, ${empty} empty replies)`,
            }
          : null;
      const base = spec.base;
      const agent = defineAgent<T>({
        ...(base ?? {}),
        id: base?.id ?? `haptic.${spec.job}`,
        instructions: spec.instructions ?? base?.instructions ?? '',
        output: {
          ...(base?.output ?? {}),
          ...(spec.schema ? { schema: spec.schema } : {}),
          strategy: 'emit',
          validate: async (envelope) => {
            const retry = await spec.validate(envelope.data);
            return retry === null ? { ok: true } : { retry };
          },
        },
        stopWhen: [answers],
      });
      const onEvent = (cortexEvent: CortexEvent) => {
        const body = cortexEvent as unknown as Record<string, unknown>;
        if (body.type === 'retry' && EMPTY_REPLY.test(String(body.issues))) empty++;
        if (['model-delta', 'output-delta', 'output-partial'].includes(String(body.type))) return;
        event(spec.job, body);
      };
      const result = await agent.run(spec.input, {
        llm,
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(profile.agentTimeoutMs)]),
        onEvent,
      }).result;
      charge(
        spec.job,
        result.meta.steps,
        result.meta.usage.inputTokens,
        result.meta.usage.outputTokens,
        result.meta.elapsedMs,
      );
      event(spec.job, {
        type: 'answer',
        ok: result.ok,
        data: result.ok ? result.output.data : null,
        error: result.ok ? null : result.error.message,
      });
      if (blocked) throw new DiscoveryStop('blocked', blocked.message, blocked);
      return result.ok ? result.output.data : null;
    },

    async decide(job, state, name, question) {
      if (!jev || jevCalls >= profile.maxJevCalls) return null;
      checkBudget();
      jevCalls++;
      try {
        const result = await jev.decide({
          state: state as never,
          questions: { [name]: question },
          options: { signal: options.signal },
        });
        charge(
          'jev',
          1,
          result.meta.usage.inputTokens,
          result.meta.usage.outputTokens,
          result.meta.durationMs ?? 0,
        );
        const decision = result.decisions[name] as { choice?: string; answer?: boolean };
        return decision.choice ?? decision.answer ?? null;
      } catch (error) {
        event(job, {
          type: 'jev-failed',
          error: String((error as Error)?.message ?? error).slice(0, 200),
        });
        return null;
      }
    },
  };
};
