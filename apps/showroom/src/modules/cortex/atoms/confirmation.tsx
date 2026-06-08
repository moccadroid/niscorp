import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import {
  CortexTopics,
  type Bus,
  type ConfirmationRequestedPayload,
  type CortexError,
  type Observation,
} from '@niscorp/cortex';
import { useCortexRuntime } from '@showroom/modules/cortex/runtime-context';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
import { recordRun } from '@showroom/modules/cortex/run-history';
import { PROVIDER } from './constants';
import { ConfirmationDialog, type ConfirmationRequest } from './confirmation-dialog';
import { DemoBanner } from './demo-banner';
import { RunButton } from './run-button';
import { RetriesPanel, type RetryAttempt } from './retries-panel';
import { Section } from './section';
import { ToolTimeline } from './tool-timeline';
import type { RunnerWithBus } from './session';

// ═══════════════════════════════════════════════════════════
// ConfirmationDemo — React shell for confirmation stories. The
// demo file's runner makes the runAgentStandalone call (passing
// tools + the bus subscription that catches confirmation events).
// This component handles the dialog UI + the approve/deny round
// trip back through the bus.
// ═══════════════════════════════════════════════════════════

type RunStatus =
  | { phase: 'idle' }
  | { phase: 'running'; attempts: RetryAttempt[]; observations: Observation[]; confirmations: ConfirmationRequest[] }
  | {
      phase: 'error';
      message: string;
      errorCode: string;
      attempts: RetryAttempt[];
      observations: Observation[];
      confirmations: ConfirmationRequest[];
    }
  | {
      phase: 'done';
      result: unknown;
      durationMs: number;
      attempts: RetryAttempt[];
      observations: Observation[];
      confirmations: ConfirmationRequest[];
    };

type Props = {
  storyId: string;
  prompt: string;
  runner: RunnerWithBus;
};

export const ConfirmationDemo: FC<Props> = ({ storyId, prompt, runner }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });
  const { setLastRun } = useCortexRuntime();
  const busRef = useRef<Bus | undefined>(undefined);

  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  useEffect(() => {
    if (status.phase === 'done') recordRun(storyId, 'pass');
    else if (status.phase === 'error') recordRun(storyId, 'fail');
  }, [storyId, status.phase]);

  const handleConfirmation = useCallback((approved: boolean, toolId: string) => {
    const b = busRef.current;
    if (!b) return;
    b.emit(
      approved ? CortexTopics.confirmationApproved : CortexTopics.confirmationDenied,
      { toolId },
      { correlationId: 'confirmation' },
    );
    setStatus((prev) => {
      if (prev.phase !== 'running') return prev;
      return {
        ...prev,
        confirmations: prev.confirmations.map((c) =>
          c.toolId === toolId && !c.resolved ? { ...c, resolved: true, approved } : c,
        ),
      };
    });
  }, []);

  const run = useCallback(async (): Promise<void> => {
    const apiKey = getKey(PROVIDER);
    if (apiKey === undefined) {
      setStatus({
        phase: 'error',
        errorCode: 'no_api_key',
        message: 'No GROQ API key configured. Open Signal → Settings to add one.',
        attempts: [],
        observations: [],
        confirmations: [],
      });
      return;
    }

    const attempts: RetryAttempt[] = [];
    const observations: Observation[] = [];
    const confirmations: ConfirmationRequest[] = [];
    setStatus({ phase: 'running', attempts: [], observations: [], confirmations: [] });
    const start = Date.now();

    const client = createOpenAIClient(PROVIDER, apiKey);

    const updateStatus = (): void => {
      setStatus({
        phase: 'running',
        attempts: attempts.slice(),
        observations: observations.slice(),
        confirmations: confirmations.slice(),
      });
    };

    const result = await runner({
      apiKey,
      client,
      onObservation: (obs) => {
        observations.push(obs);
        updateStatus();
      },
      onRetry: (p) => {
        attempts.push({ attempt: p.attempt, rawContent: p.rawContent, error: p.error });
        updateStatus();
      },
      onBus: (bus) => {
        busRef.current = bus;
        bus.on(CortexTopics.confirmationRequested, (event) => {
          const payload = event.payload as ConfirmationRequestedPayload;
          confirmations.push({
            toolId: payload.toolId,
            input: payload.input,
            resolved: false,
          });
          updateStatus();
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
        confirmations,
      });
      setLastRun({ storyId, kind: 'confirmation', durationMs: elapsed, error: err, observations });
      return;
    }
    setStatus({
      phase: 'done',
      result: result.data,
      durationMs: elapsed,
      attempts,
      observations,
      confirmations,
    });
    setLastRun({ storyId, kind: 'confirmation', durationMs: elapsed, result: result.data, observations });
  }, [runner, storyId, setLastRun]);

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;
  const observations = status.phase === 'idle' ? [] : status.observations;
  const confirmations = status.phase === 'idle' ? [] : status.confirmations;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoBanner tag="Cortex demo · human in the loop">
        The agent's policy marks <code>transfer_funds</code> as <code>requireConfirmation</code>.
        When the agent tries to call it, Cortex pauses execution and emits a confirmation request on the bus.
        The runner shows you the tool call details and waits for your decision.{' '}
        <strong>Click Approve or Deny — the agent adapts to your choice.</strong>
      </DemoBanner>

      <Section title="User prompt" body={prompt} />

      <RunButton
        label="Run agent"
        runningLabel="Running (waiting for approval)…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

      {confirmations.map((conf, i) => (
        <ConfirmationDialog
          key={i}
          request={conf}
          onApprove={() => handleConfirmation(true, conf.toolId)}
          onDeny={() => handleConfirmation(false, conf.toolId)}
        />
      ))}

      <ToolTimeline observations={observations} />

      <RetriesPanel
        attempts={attempts}
        outcome={isDone ? 'corrected' : isError ? 'failed' : 'pending'}
      />

      {isError && (
        <Section title={`Error · ${status.errorCode}`} body={status.message} variant="error" />
      )}

      {isDone && (
        <Section
          title={`Agent output (${status.durationMs}ms)`}
          body={typeof status.result === 'string' ? status.result : JSON.stringify(status.result, null, 2)}
          variant="pass"
        />
      )}
    </div>
  );
};
