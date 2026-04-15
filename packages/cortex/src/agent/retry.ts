// ═══════════════════════════════════════════════════════════
// Retry wrapper — re-prompts on validation failure
// ═══════════════════════════════════════════════════════════
//
// Fully generic in T. The caller supplies a parser that turns
// raw model content into Result<T>. On validation failure the
// loop pushes the attempt, injects a feedback producer for the
// next call, and tries again — up to maxOutputRetries.

import type { AgentDefinition } from './define-agent';
import type { ContextProducer } from '../context/types';
import type { Result } from '../types';
import type { Observation, ContentChunk } from '../schemas';
import type { CortexError } from '../errors/cortex.errors';
import type { WorkflowContext } from '../manifold/workflow-context';
import type { ExecuteAgentDeps } from './execute';
import { runRawInvocation } from './raw-invocation';
import { err, makeError } from '../errors/cortex.errors';
import { CortexTopics } from '../topics';

const DEFAULT_MAX_OUTPUT_RETRIES = 2;

type FailedAttempt = {
  attempt: number;
  rawContent: string;
  error: CortexError;
};

const retryFeedbackProducer = (attempts: ReadonlyArray<FailedAttempt>): ContextProducer => ({
  id: 'cortex.retry-feedback',
  priority: 95,
  build: (): ContentChunk[] => {
    if (attempts.length === 0) return [];
    const lines: string[] = ['## Your previous attempts failed validation'];
    lines.push(
      'Each entry below shows what you returned and why it was rejected. Fix the specific issues and respond with the corrected JSON only. No prose. No markdown fences.',
    );
    lines.push('');
    for (const entry of attempts) {
      lines.push(`### Attempt ${entry.attempt}`);
      lines.push('Your output was:');
      lines.push('```json');
      lines.push(entry.rawContent);
      lines.push('```');
      lines.push('Validation error:');
      lines.push(entry.error.message);
      lines.push('');
    }
    return [
      {
        role: 'system',
        content: lines.join('\n'),
        source: 'cortex.retry-feedback',
        tags: ['retry', 'validation-feedback'],
      },
    ];
  },
});

export const runWithRetries = async <T>(
  deps: ExecuteAgentDeps,
  agent: AgentDefinition<unknown>,
  workflow: WorkflowContext,
  input: unknown,
  tick: number,
  carriedObservations: ReadonlyArray<Observation>,
  parse: (content: string) => Result<T>,
): Promise<Result<T>> => {
  const workflowId = workflow.workflowId;
  const maxRetries = agent.config.maxOutputRetries ?? DEFAULT_MAX_OUTPUT_RETRIES;
  const failed: FailedAttempt[] = [];

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const extraProducers = failed.length > 0 ? [retryFeedbackProducer(failed)] : [];
    const raw = await runRawInvocation(
      deps,
      agent,
      workflow,
      input,
      tick,
      carriedObservations,
      extraProducers,
    );
    if (!raw.ok) return err(raw.error);

    const parsed = parse(raw.loop.content);
    if (parsed.ok) return parsed;

    const code = parsed.error.code;
    const isValidationError = code === 'output_validation_failed' || code === 'invalid_plan';
    if (!isValidationError || attempt > maxRetries) return parsed;

    failed.push({ attempt, rawContent: raw.loop.content, error: parsed.error });
    deps.bus.emit({
      topic: CortexTopics.agentRetry,
      payload: {
        agentId: agent.agentId,
        workflowId,
        attempt,
        nextAttempt: attempt + 1,
        rawContent: raw.loop.content,
        error: parsed.error,
      },
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });
  }
  return err(
    makeError('output_validation_failed', 'retry loop exited unexpectedly', {
      agentId: agent.agentId,
      workflowId,
    }),
  );
};
