import { useCallback, useEffect, useState, type FC } from 'react';
import { createSignal } from '@niscorp/signal';
import { runAgentStandalone, type SignalClient, type CortexError, type Observation } from '@niscorp/cortex';
import { isToolUseStory } from '../story-types';
import { useCortexRuntime } from '../runtime-context';
import { getKey } from '../../signal/settings/api-key-storage';
import { createOpenAIClient } from '../../signal/openai-client';
import { recordRun } from '../run-history';
import {
  DEFAULT_MODEL,
  DemoBanner,
  PassFailBadge,
  PROVIDER,
  RetriesPanel,
  RunButton,
  Section,
  type RetryAttempt,
} from './runner-shell';

// ═══════════════════════════════════════════════════════════
// Tool-use runner
// ═══════════════════════════════════════════════════════════
//
// What it shows: Cortex's tool loop in action.
//   - the agent decides which tools to call from the prompt
//   - Cortex validates each tool call's input against the tool's
//     Zod schema before invoking
//   - tool results become observations the agent sees on the next
//     iteration
//   - the agent finalizes once it has everything it needs
//
// The runner subscribes to cortex.observation.recorded via the
// onObservation callback so the user sees a live timeline of every
// tool call as it happens.
//
// Stories can optionally set `budget` (a per-run budget cap that
// triggers the policy gate) and `expectPolicyDenial` (the run is
// expected to be denied — pass becomes "policy denied as expected").

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
        Live tool timeline · {observations.length} observation{observations.length === 1 ? '' : 's'}
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
          const target = obs.toolId ?? obs.agentId ?? obs.topic ?? '?';
          const isErr = obs.error !== undefined;
          return (
            <div key={i} style={{ color: isErr ? '#991b1b' : '#1e3a8a' }}>
              <span style={{ opacity: 0.6 }}>{i + 1}.</span> [{obs.stepKind}{' '}
              <strong>{target}</strong>]{isErr ? ' ✗' : ' ✓'} ({obs.durationMs}ms)
              {isErr && <span> — {obs.error}</span>}
              {!isErr && obs.result !== undefined && (
                <span style={{ opacity: 0.85 }}> → {JSON.stringify(obs.result)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

type Props = { story: unknown };

export const ToolUseRunner: FC<Props> = ({ story }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });
  const { setLastRun } = useCortexRuntime();

  const storyId = isToolUseStory(story) ? story.id : undefined;
  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  const run = useCallback(async (): Promise<void> => {
    if (!isToolUseStory(story)) return;
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

    const client = createOpenAIClient('groq', apiKey);
    const signal = createSignal('groq', { client, model: DEFAULT_MODEL, apiKey });
    const llm: SignalClient = signal;

    const result = await runAgentStandalone(story.agent, story.prompt, {
      llm,
      tools: story.tools,
      ...(story.budget && {
        manifold: {
          defaultBudget: {
            maxTokens: story.budget.maxTokens ?? 200_000,
            maxToolCalls: story.budget.maxToolCalls ?? 200,
            maxTicks: story.budget.maxTicks ?? 20,
            maxDurationMs: 60_000,
          },
        },
      }),
      onRetry: (payload) => {
        attempts.push({
          attempt: payload.attempt,
          rawContent: payload.rawContent,
          error: payload.error as CortexError,
        });
        setStatus({
          phase: 'running',
          attempts: attempts.slice(),
          observations: observations.slice(),
        });
      },
      onObservation: (obs) => {
        observations.push(obs);
        setStatus({
          phase: 'running',
          attempts: attempts.slice(),
          observations: observations.slice(),
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
      });
      setLastRun({ storyId: story.id, kind: 'tool-use', durationMs: elapsed, error: result.error, observations });
      return;
    }
    setStatus({
      phase: 'done',
      result: result.data,
      durationMs: elapsed,
      attempts,
      observations,
    });
    setLastRun({ storyId: story.id, kind: 'tool-use', durationMs: elapsed, result: result.data, observations });
  }, [story, setLastRun]);

  if (!isToolUseStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a tool-use story.</div>;
  }

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;
  const observations = status.phase === 'idle' ? [] : status.observations;

  // For policy-denial demos, the "expected" outcome is a gate denial.
  // The denial surfaces in two possible ways:
  //   - the agent's text-mode output contains the "[cortex:gate_denied]" marker
  //   - the structured-output parser fails because the marker isn't valid JSON,
  //     producing a Result.err with code output_validation_failed referencing
  //     the gate_denied content.
  // We treat both as "denied as expected".
  const expectedDenial = story.expectPolicyDenial === true;
  let deniedAsExpected = false;
  if (expectedDenial) {
    if (isDone) {
      const stringified =
        typeof status.result === 'string' ? status.result : JSON.stringify(status.result);
      if (stringified.includes('gate_denied')) deniedAsExpected = true;
    }
    if (isError) {
      // Observations record the gate denial even when the parser
      // returns an error — check the timeline.
      const hasGateDenial = observations.some(
        (o) => o.error !== undefined && o.error.includes('gate_denied'),
      );
      if (hasGateDenial) deniedAsExpected = true;
    }
  }

  // Persist outcome to localStorage so the sidebar dot updates.
  // For tool-use:
  //   - happy path: pass when isDone
  //   - policy-denial path: pass when the gate denied (deniedAsExpected),
  //     fail otherwise (the run was supposed to be denied but wasn't)
  useEffect(() => {
    if (storyId === undefined) return;
    if (status.phase === 'done') {
      if (expectedDenial) {
        // The run completed without being denied — that's a fail
        // for the policy-denial demo (the gate was supposed to fire).
        recordRun(storyId, deniedAsExpected ? 'pass' : 'fail');
      } else {
        recordRun(storyId, 'pass');
      }
    } else if (status.phase === 'error') {
      // For the policy-denial demo, an error that includes the gate
      // denial is the expected outcome.
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

      <Section title="User prompt" body={story.prompt} />

      {story.budget !== undefined && (
        <Section
          title="Policy override (per-run budget cap)"
          body={JSON.stringify(story.budget, null, 2)}
          variant="muted"
        />
      )}

      <RunButton
        label={expectedDenial ? 'Run (expect denial)' : 'Run agent'}
        runningLabel="Running…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

      <Timeline observations={observations} />

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
