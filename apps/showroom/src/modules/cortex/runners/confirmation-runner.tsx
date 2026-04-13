import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { createSignal } from '@niscorp/signal';
import {
  runAgentStandalone,
  CortexTopics,
  type SignalClient,
  type CortexError,
  type Observation,
  type Bus,
  type ConfirmationRequestedPayload,
} from '@niscorp/cortex';
import { isConfirmationStory } from '../story-types';
import { useCortexRuntime } from '../runtime-context';
import { getKey } from '../../signal/settings/api-key-storage';
import { createOpenAIClient } from '../../signal/openai-client';
import { recordRun } from '../run-history';
import {
  DEFAULT_MODEL,
  DemoBanner,
  PROVIDER,
  RetriesPanel,
  RunButton,
  Section,
  type RetryAttempt,
} from './runner-shell';

// ═══════════════════════════════════════════════════════════
// Confirmation runner — human-in-the-loop tool approval
// ═══════════════════════════════════════════════════════════

type ConfirmationRequest = {
  toolId: string;
  input: unknown;
  resolved: boolean;
  approved?: boolean;
};

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

// ─── Confirmation dialog ──────────────────────────────────

const ConfirmationDialog: FC<{
  request: ConfirmationRequest;
  onApprove: () => void;
  onDeny: () => void;
}> = ({ request, onApprove, onDeny }) => {
  if (request.resolved) {
    return (
      <div
        style={{
          padding: '10px 14px',
          background: request.approved ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${request.approved ? '#a7f3d0' : '#fecaca'}`,
          borderLeft: `4px solid ${request.approved ? '#059669' : '#dc2626'}`,
          borderRadius: 6,
          fontSize: 12,
          color: request.approved ? '#065f46' : '#991b1b',
          fontWeight: 600,
        }}
      >
        {request.approved ? '✓ Approved' : '✗ Denied'}: {request.toolId}
      </div>
    );
  }
  return (
    <div
      style={{
        padding: '12px 14px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderLeft: '4px solid #f59e0b',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
        Confirmation required: {request.toolId}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 8,
          background: '#fef3c7',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'ui-monospace, Menlo, monospace',
          color: '#78350f',
          whiteSpace: 'pre-wrap',
          maxHeight: 120,
          overflow: 'auto',
        }}
      >
        {JSON.stringify(request.input, null, 2)}
      </pre>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onApprove}
          style={{
            padding: '6px 16px',
            background: '#059669',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Approve
        </button>
        <button
          onClick={onDeny}
          style={{
            padding: '6px 16px',
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Deny
        </button>
      </div>
    </div>
  );
};

// ─── Timeline ─────────────────────────────────────────────

const Timeline: FC<{ observations: ReadonlyArray<Observation> }> = ({ observations }) => {
  if (observations.length === 0) return null;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#1e3a8a',
          marginBottom: 6,
        }}
      >
        Tool timeline · {observations.length} observation{observations.length === 1 ? '' : 's'}
      </div>
      <div
        style={{
          padding: '8px 12px',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 6,
          fontSize: 12,
          color: '#1e3a8a',
          fontFamily: 'ui-monospace, Menlo, monospace',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {observations.map((obs, i) => {
          const target = obs.toolId ?? obs.agentId ?? '?';
          const isErr = obs.error !== undefined;
          return (
            <div key={i} style={{ color: isErr ? '#991b1b' : '#1e3a8a' }}>
              <span style={{ opacity: 0.6 }}>{i + 1}.</span> [{obs.stepKind}{' '}
              <strong>{target}</strong>] {isErr ? '✗' : '✓'} ({obs.durationMs}ms)
              {isErr && <span> — {obs.error}</span>}
              {!isErr && obs.result !== undefined && (
                <span style={{ opacity: 0.85 }}> → {JSON.stringify(obs.result).slice(0, 120)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Runner ───────────────────────────────────────────────

type Props = { story: unknown };

export const ConfirmationRunner: FC<Props> = ({ story }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });
  const { setLastRun } = useCortexRuntime();
  const busRef = useRef<Bus | undefined>(undefined);

  const storyId = isConfirmationStory(story) ? story.id : undefined;
  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  useEffect(() => {
    if (storyId === undefined) return;
    if (status.phase === 'done') recordRun(storyId, 'pass');
    else if (status.phase === 'error') recordRun(storyId, 'fail');
  }, [storyId, status.phase]);

  const handleConfirmation = useCallback((approved: boolean, toolId: string) => {
    const b = busRef.current;
    if (!b) return;
    b.emit({
      topic: approved ? CortexTopics.confirmationApproved : CortexTopics.confirmationDenied,
      payload: { toolId },
      meta: { timestamp: Date.now(), correlationId: 'confirmation' },
    });
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
    if (!isConfirmationStory(story)) return;
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

    const client = createOpenAIClient('groq', apiKey);
    const signal = createSignal('groq', { client, model: DEFAULT_MODEL, apiKey });
    const llm: SignalClient = signal;

    const updateStatus = (): void => {
      setStatus({
        phase: 'running',
        attempts: attempts.slice(),
        observations: observations.slice(),
        confirmations: confirmations.slice(),
      });
    };

    const result = await runAgentStandalone(story.agent, story.prompt, {
      llm,
      tools: story.tools,
      onRetry: (payload) => {
        attempts.push({
          attempt: payload.attempt,
          rawContent: payload.rawContent,
          error: payload.error as CortexError,
        });
        updateStatus();
      },
      onObservation: (obs) => {
        observations.push(obs);
        updateStatus();
      },
      onBus: (bus) => {
        busRef.current = bus;
        bus.on(CortexTopics.confirmationRequested, (event) => {
          const payload = event.payload;
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
      setStatus({
        phase: 'error',
        errorCode: result.error.code,
        message: result.error.message,
        attempts,
        observations,
        confirmations,
      });
      setLastRun({ storyId: story.id, kind: 'confirmation', durationMs: elapsed, error: result.error, observations });
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
    setLastRun({ storyId: story.id, kind: 'confirmation', durationMs: elapsed, result: result.data, observations });
  }, [story, setLastRun]);

  if (!isConfirmationStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a confirmation story.</div>;
  }

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

      <Section title="User prompt" body={story.prompt} />

      <Section
        title="Policy (on the agent)"
        body={`tools: { requireConfirmation: ['demo.transfer_funds'] }\nconfirmationTimeoutMs: 30000`}
        variant="muted"
      />

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

      <Timeline observations={observations} />

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
