import { useCallback, useEffect, useState, type FC } from 'react';
import { createSignal } from '@niscorp/signal';
import { runAgentStandalone, CortexTopics, type SignalClient, type CortexError, type Observation } from '@niscorp/cortex';
import { isRulesStory } from '../story-types';
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
// Rules engine runner
// ═══════════════════════════════════════════════════════════

type RuleEvaluation = {
  afterObservation: number;
  matched: boolean;
  ruleId?: string;
  effectKind?: string;
  effectMessage?: string;
  accumulators: Record<string, Record<string, unknown>>;
};

type RunStatus =
  | { phase: 'idle' }
  | { phase: 'running'; attempts: RetryAttempt[]; observations: Observation[]; evals: RuleEvaluation[] }
  | {
      phase: 'error';
      message: string;
      errorCode: string;
      attempts: RetryAttempt[];
      observations: Observation[];
      evals: RuleEvaluation[];
    }
  | {
      phase: 'done';
      result: unknown;
      durationMs: number;
      attempts: RetryAttempt[];
      observations: Observation[];
      evals: RuleEvaluation[];
    };

// ───────────────────────────────────────────────────────────
// Accumulator state display
// ───────────────────────────────────────────────────────────

const AccumulatorBadge: FC<{ accumulators: Record<string, Record<string, unknown>> }> = ({ accumulators }) => {
  const ruleIds = Object.keys(accumulators);
  if (ruleIds.length === 0) return null;
  const parts: string[] = [];
  for (const ruleId of ruleIds) {
    const vals = accumulators[ruleId];
    if (!vals) continue;
    for (const [key, value] of Object.entries(vals)) {
      parts.push(`${key}=${typeof value === 'number' ? value : JSON.stringify(value)}`);
    }
  }
  return (
    <span style={{ opacity: 0.7, fontSize: 11 }}> [{parts.join(', ')}]</span>
  );
};

// ───────────────────────────────────────────────────────────
// Timeline — interleaves observations with rule evaluations
// ───────────────────────────────────────────────────────────

const Timeline: FC<{ observations: ReadonlyArray<Observation>; evals: ReadonlyArray<RuleEvaluation> }> = ({
  observations,
  evals,
}) => {
  if (observations.length === 0) return null;

  type TimelineEntry =
    | { type: 'observation'; obs: Observation; index: number }
    | { type: 'eval'; eval: RuleEvaluation };

  const entries: TimelineEntry[] = [];
  let evalIdx = 0;

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    if (obs) entries.push({ type: 'observation', obs, index: i });
    while (evalIdx < evals.length) {
      const ev = evals[evalIdx];
      if (!ev || ev.afterObservation !== i) break;
      entries.push({ type: 'eval', eval: ev });
      evalIdx++;
    }
  }
  while (evalIdx < evals.length) {
    const ev = evals[evalIdx];
    if (ev) entries.push({ type: 'eval', eval: ev });
    evalIdx++;
  }

  const matchedCount = evals.filter((e) => e.matched).length;

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
        Live timeline · {observations.length} observation{observations.length === 1 ? '' : 's'} ·{' '}
        {evals.length} rule check{evals.length === 1 ? '' : 's'} ·{' '}
        {matchedCount} fired
      </div>
      <div
        style={{
          padding: '8px 12px',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'ui-monospace, Menlo, monospace',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {entries.map((entry, i) => {
          if (entry.type === 'observation') {
            const obs = entry.obs;
            const target = obs.toolId ?? obs.agentId ?? obs.topic ?? '?';
            const isErr = obs.error !== undefined;
            return (
              <div key={`obs-${i}`} style={{ color: isErr ? '#991b1b' : '#1e3a8a' }}>
                <span style={{ opacity: 0.6 }}>{entry.index + 1}.</span> [{obs.stepKind}{' '}
                <strong>{target}</strong>] {isErr ? '✗' : '✓'} ({obs.durationMs}ms)
                {isErr && <span> — {obs.error}</span>}
                {!isErr && obs.result !== undefined && (
                  <span style={{ opacity: 0.85 }}> → {JSON.stringify(obs.result).slice(0, 120)}</span>
                )}
              </div>
            );
          }
          const ev = entry.eval;
          if (!ev.matched) {
            return (
              <div
                key={`eval-${i}`}
                style={{
                  color: '#6b7280',
                  fontSize: 11,
                  paddingLeft: 16,
                  opacity: 0.8,
                }}
              >
                ○ rule checked — no match
                <AccumulatorBadge accumulators={ev.accumulators} />
              </div>
            );
          }
          const isAbort = ev.effectKind === 'abort';
          return (
            <div
              key={`eval-${i}`}
              style={{
                color: isAbort ? '#991b1b' : '#b45309',
                fontWeight: 700,
                padding: '4px 0',
                borderLeft: `3px solid ${isAbort ? '#dc2626' : '#f59e0b'}`,
                paddingLeft: 8,
                marginTop: 2,
                marginBottom: 2,
              }}
            >
              ⚡ RULE FIRED: {ev.ruleId} → {ev.effectKind}
              {ev.effectMessage && <span style={{ fontWeight: 400 }}> — {ev.effectMessage}</span>}
              <AccumulatorBadge accumulators={ev.accumulators} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Runner
// ───────────────────────────────────────────────────────────

type Props = { story: unknown };

export const RulesRunner: FC<Props> = ({ story }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });
  const { setLastRun } = useCortexRuntime();

  const storyId = isRulesStory(story) ? story.id : undefined;
  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  useEffect(() => {
    if (storyId === undefined) return;
    if (status.phase === 'done') recordRun(storyId, 'pass');
    else if (status.phase === 'error') {
      const hasRuleFired = status.evals.some((e) => e.matched);
      recordRun(storyId, hasRuleFired ? 'pass' : 'fail');
    }
  }, [storyId, status.phase]);

  const run = useCallback(async (): Promise<void> => {
    if (!isRulesStory(story)) return;
    const apiKey = getKey(PROVIDER);
    if (apiKey === undefined) {
      setStatus({
        phase: 'error',
        errorCode: 'no_api_key',
        message: 'No GROQ API key configured. Open Signal → Settings to add one.',
        attempts: [],
        observations: [],
        evals: [],
      });
      return;
    }

    const attempts: RetryAttempt[] = [];
    const observations: Observation[] = [];
    const evals: RuleEvaluation[] = [];
    setStatus({ phase: 'running', attempts: [], observations: [], evals: [] });
    const start = Date.now();

    const client = createOpenAIClient('groq', apiKey);
    const signal = createSignal('groq', { client, model: DEFAULT_MODEL, apiKey });
    const llm: SignalClient = signal;

    const updateStatus = (): void => {
      setStatus({
        phase: 'running',
        attempts: attempts.slice(),
        observations: observations.slice(),
        evals: evals.slice(),
      });
    };

    const result = await runAgentStandalone(story.agent, story.prompt, {
      llm,
      tools: story.tools,
      ...(story.specialists && { specialists: story.specialists }),
      rules: story.rules,
      effects: story.effects,
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
        // Every rule evaluation — matched or not — with accumulator state.
        bus.on(CortexTopics.ruleEvaluated, (event) => {
          const payload = event.payload as {
            result: { matched: false } | { matched: true; ruleId: string; effect: Record<string, string> };
            accumulators: Record<string, Record<string, unknown>>;
          };
          if (!payload.result.matched) {
            evals.push({
              afterObservation: observations.length - 1,
              matched: false,
              accumulators: payload.accumulators,
            });
          } else {
            const effectKey = Object.keys(payload.result.effect)[0] ?? 'unknown';
            const effectVal = Object.values(payload.result.effect)[0] ?? '';
            evals.push({
              afterObservation: observations.length - 1,
              matched: true,
              ruleId: payload.result.ruleId,
              effectKind: effectKey,
              effectMessage: typeof effectVal === 'string' ? effectVal : JSON.stringify(effectVal),
              accumulators: payload.accumulators,
            });
          }
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
        evals,
      });
      setLastRun({ storyId: story.id, kind: 'rules', durationMs: elapsed, error: result.error, observations });
      return;
    }
    setStatus({
      phase: 'done',
      result: result.data,
      durationMs: elapsed,
      attempts,
      observations,
      evals,
    });
    setLastRun({ storyId: story.id, kind: 'rules', durationMs: elapsed, result: result.data, observations });
  }, [story, setLastRun]);

  if (!isRulesStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a rules story.</div>;
  }

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;
  const observations = status.phase === 'idle' ? [] : status.observations;
  const evals = status.phase === 'idle' ? [] : status.evals;

  const hasRuleFired = evals.some((e) => e.matched);
  const isRuleAbortError = isError && hasRuleFired;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoBanner tag="Cortex demo · rules engine">
        Declarative JSON rules steer agent behavior at runtime. Rules watch bus events via accumulators,
        evaluate Prism-style conditions (<code>$gte</code>, <code>$lt</code>, <code>$and</code>), and fire
        effects (<code>inject</code> context, <code>abort</code> the run). No code interceptors —{' '}
        <strong>the rule below is the entire steering logic.</strong>
      </DemoBanner>

      <Section title="The rule (this is real code)" body={story.ruleCode} variant="info" />

      <Section title="User prompt" body={story.prompt} />

      <RunButton
        label="Run with rules"
        runningLabel="Running (rules active)…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

      <Timeline observations={observations} evals={evals} />

      <RetriesPanel
        attempts={attempts}
        outcome={isDone || isRuleAbortError ? 'corrected' : isError ? 'failed' : 'pending'}
      />

      {isError && !isRuleAbortError && (
        <Section title={`Error · ${status.errorCode}`} body={status.message} variant="error" />
      )}

      {isRuleAbortError && (
        <>
          <Section
            title="Rule abort fired"
            body={status.message}
            variant="pass"
          />
          <PassFailBadge
            pass
            passLabel="Rule engine terminated the run as designed — the abort effect fired"
            failLabel=""
          />
        </>
      )}

      {isDone && (
        <Section
          title={`Agent output (${status.durationMs}ms) — shaped by rule`}
          body={typeof status.result === 'string' ? status.result : JSON.stringify(status.result, null, 2)}
          variant="pass"
        />
      )}
    </div>
  );
};
