import { useCallback, useEffect, useState, type FC } from 'react';
import type { CortexError, Observation } from '@niscorp/cortex';
import { useCortexRuntime } from '@showroom/modules/cortex/runtime-context';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
import { recordRun } from '@showroom/modules/cortex/run-history';
import { PROVIDER } from './constants';
import { DemoBanner } from './demo-banner';
import { PassFailBadge } from './pass-fail-badge';
import { RunButton } from './run-button';
import { RetriesPanel, type RetryAttempt } from './retries-panel';
import { Section } from './section';
import { ToolTimeline } from './tool-timeline';
import type { Runner } from './session';

// ═══════════════════════════════════════════════════════════
// ToolUseDemo — React shell for tool-use stories. The demo file's
// runner makes the runAgentStandalone call (with tools, manifold
// budget, observation/retry callbacks). This component owns the
// LLM construction, state machine, and observation+retry rendering.
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
  expectPolicyDenial?: boolean;
};

export const ToolUseDemo: FC<Props> = ({ storyId, prompt, runner, expectPolicyDenial }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });
  const { setLastRun } = useCortexRuntime();

  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

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
      setLastRun({ storyId, kind: 'tool-use', durationMs: elapsed, error: err, observations });
      return;
    }
    setStatus({
      phase: 'done',
      result: result.data,
      durationMs: elapsed,
      attempts,
      observations,
    });
    setLastRun({ storyId, kind: 'tool-use', durationMs: elapsed, result: result.data, observations });
  }, [runner, storyId, setLastRun]);

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;
  const observations = status.phase === 'idle' ? [] : status.observations;

  const expectedDenial = expectPolicyDenial === true;
  let deniedAsExpected = false;
  if (expectedDenial) {
    if (isDone) {
      const stringified =
        typeof status.result === 'string' ? status.result : JSON.stringify(status.result);
      if (stringified.includes('gate_denied')) deniedAsExpected = true;
    }
    if (isError) {
      const hasGateDenial = observations.some(
        (o) => o.error !== undefined && o.error.includes('gate_denied'),
      );
      if (hasGateDenial) deniedAsExpected = true;
    }
  }

  useEffect(() => {
    if (status.phase === 'done') {
      if (expectedDenial) recordRun(storyId, deniedAsExpected ? 'pass' : 'fail');
      else recordRun(storyId, 'pass');
    } else if (status.phase === 'error') {
      if (expectedDenial && deniedAsExpected) recordRun(storyId, 'pass');
      else recordRun(storyId, 'fail');
    }
  }, [storyId, status.phase, expectedDenial, deniedAsExpected]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoBanner tag="Cortex demo · tool use">
        Cortex's tool loop drives the model→tool→model iteration. Each tool call is validated against the tool's
        Zod input schema, executed under the policy gate, and its result becomes an observation the agent sees
        in the next iteration.{' '}
        {expectedDenial ? (
          <strong>This demo expects the policy gate to deny — watch the budget run out.</strong>
        ) : (
          <strong>Watch the live tool timeline below as the agent works.</strong>
        )}
      </DemoBanner>

      <Section title="User prompt" body={prompt} />

      <RunButton
        label={expectedDenial ? 'Run (expect denial)' : 'Run agent'}
        runningLabel="Running…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

      <ToolTimeline observations={observations} />

      <RetriesPanel
        attempts={attempts}
        outcome={
          isDone || (isError && deniedAsExpected)
            ? 'corrected'
            : isError
              ? 'failed'
              : 'pending'
        }
      />

      {isError && !deniedAsExpected && (
        <Section title={`Error · ${status.errorCode}`} body={status.message} variant="error" />
      )}

      {isError && deniedAsExpected && (
        <PassFailBadge
          pass
          passLabel="Policy denied the run as expected — gate fired before completion"
          failLabel=""
        />
      )}

      {isDone && (
        <>
          <Section
            title={`Result (${status.durationMs}ms)`}
            body={
              typeof status.result === 'string'
                ? status.result
                : JSON.stringify(status.result, null, 2)
            }
            variant={expectedDenial ? (deniedAsExpected ? 'pass' : 'fail') : 'pass'}
          />
          {expectedDenial && (
            <PassFailBadge
              pass={deniedAsExpected}
              passLabel="Policy denied the run as expected"
              failLabel="Run completed but policy was supposed to deny it"
            />
          )}
        </>
      )}
    </div>
  );
};
