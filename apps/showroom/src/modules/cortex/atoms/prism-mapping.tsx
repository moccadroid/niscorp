import { useCallback, useEffect, useState, type FC } from 'react';
import type { CortexError } from '@niscorp/cortex';
import type { MappingAgentOutput } from '@niscorp/prism/agent';
import { evaluateSafe, type JsonObject, type JsonValue } from '@niscorp/prism';
import { useCortexRuntime, type LastRun } from '@showroom/modules/cortex/runtime-context';
import { recordRun } from '@showroom/modules/cortex/run-history';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
import { PROVIDER } from './constants';
import { DemoBanner } from './demo-banner';
import { PassFailBadge } from './pass-fail-badge';
import { RunButton } from './run-button';
import { RetriesPanel, type RetryAttempt } from './retries-panel';
import { Section } from './section';
import { deepEqual } from './stable-json';
import type { Runner } from './session';

// ═══════════════════════════════════════════════════════════
// PrismMappingDemo — React shell. Runner returns a MappingAgent
// output (the generated Prism config); the orchestrator then
// evaluates that config against sampleInput and deep-compares to
// expected for a pass/fail badge.
// ═══════════════════════════════════════════════════════════

type RunStatus =
  | { phase: 'idle' }
  | { phase: 'running'; attempts: RetryAttempt[] }
  | { phase: 'error'; message: string; rawModelOutput?: unknown; attempts: RetryAttempt[] }
  | { phase: 'done'; result: LastRun; attempts: RetryAttempt[] };

type Props = {
  storyId: string;
  sampleInput: JsonObject;
  expected: JsonValue;
  fieldDescriptions?: Record<string, string>;
  runner: Runner<MappingAgentOutput>;
};

export const PrismMappingDemo: FC<Props> = ({
  storyId,
  sampleInput,
  expected,
  fieldDescriptions,
  runner,
}) => {
  const { setLastRun } = useCortexRuntime();
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });

  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  useEffect(() => {
    if (status.phase === 'done') {
      recordRun(storyId, status.result.prism?.matchesExpected ? 'pass' : 'fail');
    } else if (status.phase === 'error') {
      recordRun(storyId, 'fail');
    }
  }, [storyId, status]);

  const run = useCallback(async (): Promise<void> => {
    const apiKey = getKey(PROVIDER);
    if (apiKey === undefined) {
      setStatus({
        phase: 'error',
        message:
          'No GROQ API key configured. Open the Signal module → Settings and add one. Cortex demos reuse the Signal key store.',
        attempts: [],
      });
      return;
    }

    const attempts: RetryAttempt[] = [];
    setStatus({ phase: 'running', attempts: [] });
    const start = Date.now();

    const client = createOpenAIClient(PROVIDER, apiKey);

    const result = await runner({
      apiKey,
      client,
      onObservation: () => {},
      onRetry: (p) => {
        attempts.push({ attempt: p.attempt, rawContent: p.rawContent, error: p.error });
        setStatus({ phase: 'running', attempts: attempts.slice() });
      },
    });

    if (!result.ok) {
      const err = result.error as CortexError;
      setStatus({ phase: 'error', message: `${err.code}: ${err.message}`, attempts });
      return;
    }

    const { config, reasoning } = result.data;
    const evalResult = evaluateSafe(config, sampleInput);
    if (!evalResult.ok) {
      setStatus({
        phase: 'error',
        message: `Generated config evaluated with an error: ${evalResult.error.message}`,
        rawModelOutput: config,
        attempts,
      });
      return;
    }

    const evaluated: JsonValue = evalResult.data;
    const matches = deepEqual(evaluated, expected);
    const lastRun: LastRun = {
      storyId,
      kind: 'prism-mapping',
      durationMs: Date.now() - start,
      result: evaluated,
      prism: {
        config,
        ...(reasoning && { reasoning }),
        evaluated,
        matchesExpected: matches,
      },
    };
    setLastRun(lastRun);
    setStatus({ phase: 'done', result: lastRun, attempts });
  }, [runner, storyId, sampleInput, expected, setLastRun]);

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoBanner tag="Cortex demo · standalone · structured output">
        Cortex's structured-output mode validates the agent's response against{' '}
        <code>MappingAgentOutputSchema</code> — which embeds Prism's <code>ConfigSchema</code> directly. So the
        entire Prism Node tree is validated end-to-end on every call. Validation failures auto-retry with the
        prior attempt fed back into the prompt.
      </DemoBanner>

      <Section title="Sample input" body={JSON.stringify(sampleInput, null, 2)} />
      <Section title="Expected output" body={JSON.stringify(expected, null, 2)} />

      {fieldDescriptions !== undefined && (
        <Section
          title="Hints sent to the agent (optional per-field guidance)"
          body={JSON.stringify(fieldDescriptions, null, 2)}
          variant="muted"
        />
      )}

      <RunButton
        label="Run mapping agent"
        runningLabel="Running mapping agent…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

      <RetriesPanel
        attempts={attempts}
        outcome={isDone ? 'corrected' : isError ? 'failed' : 'pending'}
      />

      {isError && (
        <>
          <Section title="Error" body={status.message} variant="error" />
          {status.rawModelOutput !== undefined && (
            <Section
              title="Raw model output (what the agent returned)"
              body={JSON.stringify(status.rawModelOutput, null, 2)}
              variant="error"
            />
          )}
        </>
      )}

      {isDone && status.result.prism !== undefined && (
        <>
          <Section title="Generated Prism config" body={JSON.stringify(status.result.prism.config, null, 2)} />
          {status.result.prism.reasoning !== undefined && (
            <Section title="Agent reasoning" body={status.result.prism.reasoning} variant="muted" />
          )}
          <Section
            title="Evaluated output"
            body={JSON.stringify(status.result.prism.evaluated, null, 2)}
            variant={status.result.prism.matchesExpected ? 'pass' : 'fail'}
          />
          <PassFailBadge
            pass={status.result.prism.matchesExpected}
            passLabel={`Output matches expected (${status.result.durationMs}ms)`}
            failLabel={`Output does not match expected (${status.result.durationMs}ms)`}
          />
        </>
      )}
    </div>
  );
};
