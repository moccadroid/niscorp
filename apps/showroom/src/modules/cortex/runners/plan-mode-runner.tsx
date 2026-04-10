import { useCallback, useEffect, useState, type FC } from 'react';
import { createSignal } from '@niscorp/signal';
import { runAgentStandalone, type SignalClient, type CortexError, type Observation } from '@niscorp/cortex';
import { isPlanModeStory } from '../story-types';
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
// Plan-mode runner
// ═══════════════════════════════════════════════════════════
//
// What it shows: Cortex's plan-mode tick loop.
//   - the agent's outputMode is 'plan' so each call returns an
//     ActionPlan (a JSON DSL of operations)
//   - Cortex's plan executor walks the plan depth-first, gating
//     each node, executing tools, delegating to specialists via
//     ask_agent, recording observations
//   - the outer tick loop re-invokes the agent with the accumulated
//     observations until a `final` node lands or maxTicks fires
//
// The runner subscribes to the bus to capture both observations
// (per plan step) and ticks (per outer iteration). The timeline
// renders ticks as group headers and observations as nested entries
// so the user can see the agent thinking across multiple rounds.

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
  // Group observations by tick. Each tick gets a header.
  const byTick = new Map<number, Observation[]>();
  for (const o of observations) {
    const list = byTick.get(o.tick) ?? [];
    list.push(o);
    byTick.set(o.tick, list);
  }
  const ticks = Array.from(byTick.keys()).sort((a, b) => a - b);

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
        Plan-mode timeline · {ticks.length} tick{ticks.length === 1 ? '' : 's'} ·{' '}
        {observations.length} observation{observations.length === 1 ? '' : 's'}
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
          gap: 8,
        }}
      >
        {ticks.map((tick) => {
          const list = byTick.get(tick) ?? [];
          return (
            <div key={tick}>
              <div style={{ fontWeight: 700, opacity: 0.7, marginBottom: 2 }}>tick {tick}</div>
              {list.map((obs, i) => {
                const target = obs.toolId ?? obs.agentId ?? obs.topic ?? obs.stepKind;
                const isErr = obs.error !== undefined;
                return (
                  <div key={i} style={{ paddingLeft: 12, color: isErr ? '#991b1b' : '#1e3a8a' }}>
                    [{obs.stepKind} <strong>{target}</strong>] {isErr ? '✗' : '✓'} ({obs.durationMs}ms)
                    {isErr && <span> — {obs.error}</span>}
                    {!isErr && obs.result !== undefined && (
                      <span style={{ opacity: 0.85 }}> → {JSON.stringify(obs.result).slice(0, 200)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

type Props = { story: unknown };

export const PlanModeRunner: FC<Props> = ({ story }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });

  const storyId = isPlanModeStory(story) ? story.id : undefined;
  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  // Persist outcome to localStorage so the sidebar dot updates.
  useEffect(() => {
    if (storyId === undefined) return;
    if (status.phase === 'done') recordRun(storyId, 'pass');
    else if (status.phase === 'error') recordRun(storyId, 'fail');
  }, [storyId, status.phase]);

  const run = useCallback(async (): Promise<void> => {
    if (!isPlanModeStory(story)) return;
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
      ...(story.tools && { tools: story.tools }),
      ...(story.specialists && { specialists: story.specialists }),
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

    if (!result.ok) {
      setStatus({
        phase: 'error',
        errorCode: result.error.code,
        message: result.error.message,
        attempts,
        observations,
      });
      return;
    }
    setStatus({
      phase: 'done',
      result: result.data,
      durationMs: Date.now() - start,
      attempts,
      observations,
    });
  }, [story]);

  if (!isPlanModeStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a plan-mode story.</div>;
  }

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;
  const observations = status.phase === 'idle' ? [] : status.observations;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoBanner tag="Cortex demo · plan mode (tick loop)">
        The agent's <code>outputMode</code> is <code>'plan'</code>, so each model call returns an{' '}
        <code>ActionPlan</code>: a JSON DSL of operations Cortex's plan executor walks depth-first. Each tool call,
        each <code>ask_agent</code> delegation, each <code>parallel</code> branch is gated, executed, and
        recorded as an observation. The outer tick loop re-invokes the agent with the new observations until
        it returns a <code>final</code> node.
      </DemoBanner>

      <Section title="User prompt" body={story.prompt} />

      {story.specialists !== undefined && story.specialists.length > 0 && (
        <Section
          title="Specialists registered (available via ask_agent)"
          body={story.specialists.map((s) => `- ${s.config.id} (${s.config.outputMode}) — ${s.config.description}`).join('\n')}
          variant="muted"
        />
      )}

      <RunButton
        label="Run director"
        runningLabel="Running plan-mode agent…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

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
          title={`Final result (${status.durationMs}ms)`}
          body={
            typeof status.result === 'string' ? status.result : JSON.stringify(status.result, null, 2)
          }
          variant="pass"
        />
      )}
    </div>
  );
};
