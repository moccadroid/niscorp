import { useCallback, useEffect, useState, type FC } from 'react';
import { CortexTopics, type CortexError, type Observation } from '@niscorp/cortex';
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
import { RuleTimeline, type RuleEvaluation } from './rule-timeline';
import type { RunnerWithBus } from './session';

// ═══════════════════════════════════════════════════════════
// RulesDemo — React shell for rules-kind stories. The demo file's
// runner makes the runAgentStandalone call (passing rules, optional
// effects/specialists, plus the bus subscription that captures
// rule-evaluation events for the live timeline).
// ═══════════════════════════════════════════════════════════

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

type Props = {
  storyId: string;
  prompt: string;
  runner: RunnerWithBus;
};

export const RulesDemo: FC<Props> = ({ storyId, prompt, runner }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });
  const { setLastRun } = useCortexRuntime();

  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  useEffect(() => {
    if (status.phase === 'done') recordRun(storyId, 'pass');
    else if (status.phase === 'error') {
      const hasRuleFired = status.evals.some((e) => e.matched);
      recordRun(storyId, hasRuleFired ? 'pass' : 'fail');
    }
  }, [storyId, status]);

  const run = useCallback(async (): Promise<void> => {
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

    const client = createOpenAIClient(PROVIDER, apiKey);

    const updateStatus = (): void => {
      setStatus({
        phase: 'running',
        attempts: attempts.slice(),
        observations: observations.slice(),
        evals: evals.slice(),
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
      const err = result.error as CortexError;
      setStatus({
        phase: 'error',
        errorCode: err.code,
        message: err.message,
        attempts,
        observations,
        evals,
      });
      setLastRun({ storyId, kind: 'rules', durationMs: elapsed, error: err, observations });
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
    setLastRun({ storyId, kind: 'rules', durationMs: elapsed, result: result.data, observations });
  }, [runner, storyId, setLastRun]);

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

      <Section title="User prompt" body={prompt} />

      <RunButton
        label="Run with rules"
        runningLabel="Running (rules active)…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

      <RuleTimeline observations={observations} evals={evals} />

      <RetriesPanel
        attempts={attempts}
        outcome={isDone || isRuleAbortError ? 'corrected' : isError ? 'failed' : 'pending'}
      />

      {isError && !isRuleAbortError && (
        <Section title={`Error · ${status.errorCode}`} body={status.message} variant="error" />
      )}

      {isRuleAbortError && (
        <>
          <Section title="Rule abort fired" body={status.message} variant="pass" />
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
