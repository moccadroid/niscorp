import { useCallback, useEffect, useState, type FC } from 'react';
import type { CortexError, Observation } from '@niscorp/cortex';
import { useCortexRuntime } from '@showroom/modules/cortex/runtime-context';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
import { recordRun } from '@showroom/modules/cortex/run-history';
import { PROVIDER } from './constants';
import { DemoBanner } from './demo-banner';
import { RunButton } from './run-button';
import { RetriesPanel, type RetryAttempt } from './retries-panel';
import { Section } from './section';
import { TickTimeline } from './tick-timeline';
import type { Runner } from './session';

// ═══════════════════════════════════════════════════════════
// PlanModeDemo — React shell for plan-mode stories. The demo file's
// runner makes the runAgentStandalone call (with optional tools and
// specialists). This component owns LLM construction, the state
// machine, and the per-tick observation timeline.
// ═══════════════════════════════════════════════════════════

type RunStatus =
  | { phase: 'idle' }
  | { phase: 'running'; attempts: RetryAttempt[]; observations: Observation[] }
  | {
      phase: 'error';
      message: string;
      errorCode: string;
      attempts: RetryAttempt[];
      observations: Observation[];
    }
  | {
      phase: 'done';
      result: unknown;
      durationMs: number;
      attempts: RetryAttempt[];
      observations: Observation[];
    };

type Props = {
  storyId: string;
  prompt: string;
  runner: Runner;
  specialistsBlurb?: string;
};

export const PlanModeDemo: FC<Props> = ({ storyId, prompt, runner, specialistsBlurb }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });
  const { setLastRun } = useCortexRuntime();

  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  useEffect(() => {
    if (status.phase === 'done') recordRun(storyId, 'pass');
    else if (status.phase === 'error') recordRun(storyId, 'fail');
  }, [storyId, status.phase]);

  const run = useCallback(async (): Promise<void> => {
    const apiKey = getKey(PROVIDER);
    if (apiKey === undefined) {
      setStatus({
        phase: 'error',
        errorCode: 'no_api_key',
        message: 'No GROQ API key configured. Open Signal → Settings to add one.',
        attempts: [],
        observations: [],
      });
      return;
    }

    const attempts: RetryAttempt[] = [];
    const observations: Observation[] = [];
    setStatus({ phase: 'running', attempts: [], observations: [] });
    const start = Date.now();

    const client = createOpenAIClient(PROVIDER, apiKey);

    const result = await runner({
      apiKey,
      client,
      onObservation: (obs) => {
        observations.push(obs);
        setStatus({
          phase: 'running',
          attempts: attempts.slice(),
          observations: observations.slice(),
        });
      },
      onRetry: (p) => {
        attempts.push({ attempt: p.attempt, rawContent: p.rawContent, error: p.error });
        setStatus({
          phase: 'running',
          attempts: attempts.slice(),
          observations: observations.slice(),
        });
      },
    });

    const elapsed = Date.now() - start;
    if (!result.ok) {
      const err = result.error as CortexError;
      setStatus({
        phase: 'error',
        errorCode: err.code,
        message: err.message,
        attempts,
        observations,
      });
      setLastRun({ storyId, kind: 'plan-mode', durationMs: elapsed, error: err, observations });
      return;
    }
    setStatus({
      phase: 'done',
      result: result.data,
      durationMs: elapsed,
      attempts,
      observations,
    });
    setLastRun({ storyId, kind: 'plan-mode', durationMs: elapsed, result: result.data, observations });
  }, [runner, storyId, setLastRun]);

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;
  const observations = status.phase === 'idle' ? [] : status.observations;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoBanner tag="Cortex demo · plan mode (tick loop)">
        The agent's <code>outputMode</code> is <code>'plan'</code>, so each model call returns an{' '}
        <code>ActionPlan</code>: a JSON DSL of operations Cortex's plan executor walks depth-first. Each tool
        call, each <code>ask_agent</code> delegation, each <code>parallel</code> branch is gated, executed, and
        recorded as an observation. The outer tick loop re-invokes the agent with the new observations until
        it returns a <code>final</code> node.
      </DemoBanner>

      <Section title="User prompt" body={prompt} />

      {specialistsBlurb !== undefined && (
        <Section title="Specialists registered (available via ask_agent)" body={specialistsBlurb} variant="muted" />
      )}

      <RunButton
        label="Run director"
        runningLabel="Running plan-mode agent…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

      <TickTimeline observations={observations} />

      <RetriesPanel
        attempts={attempts}
        outcome={isDone ? 'corrected' : isError ? 'failed' : 'pending'}
      />

      {isError && (
        <Section title={`Error · ${status.errorCode}`} body={status.message} variant="error" />
      )}

      {isDone && (
        <Section
          title={`Final result (${status.durationMs}ms)`}
          body={typeof status.result === 'string' ? status.result : JSON.stringify(status.result, null, 2)}
          variant="pass"
        />
      )}
    </div>
  );
};
