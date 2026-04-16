import { useCallback, useEffect, useState, type FC } from 'react';
import type { CortexError } from '@niscorp/cortex';
import { useCortexRuntime } from '@showroom/modules/cortex/runtime-context';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
import { recordRun } from '@showroom/modules/cortex/run-history';
import { PROVIDER } from './constants';
import { DemoBanner } from './demo-banner';
import { RunButton } from './run-button';
import { RetriesPanel, type RetryAttempt } from './retries-panel';
import { Section } from './section';
import type { Runner } from './session';

// ═══════════════════════════════════════════════════════════
// StructuredExtractDemo — React shell for a structured-extract
// story. Owns: state machine, Run button, retries panel, output
// section. The demo file owns the actual runAgentStandalone call
// (passed in as `runner`).
// ═══════════════════════════════════════════════════════════

type RunStatus =
  | { phase: 'idle' }
  | { phase: 'running'; attempts: RetryAttempt[] }
  | { phase: 'error'; message: string; attempts: RetryAttempt[] }
  | { phase: 'done'; result: unknown; durationMs: number; attempts: RetryAttempt[] };

type Props = {
  storyId: string;
  inputText: string;
  expectedFields?: Record<string, string | number>;
  runner: Runner;
};

export const StructuredExtractDemo: FC<Props> = ({ storyId, inputText, expectedFields, runner }) => {
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
        message: 'No GROQ API key configured. Open Signal → Settings to add one.',
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

    const elapsed = Date.now() - start;
    if (!result.ok) {
      const err = result.error as CortexError;
      setStatus({ phase: 'error', message: `${err.code}: ${err.message}`, attempts });
      setLastRun({ storyId, kind: 'structured-extract', durationMs: elapsed, error: err });
      return;
    }
    setStatus({ phase: 'done', result: result.data, durationMs: elapsed, attempts });
    setLastRun({ storyId, kind: 'structured-extract', durationMs: elapsed, result: result.data });
  }, [runner, storyId, setLastRun]);

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoBanner tag="Cortex demo · standalone · structured output">
        The most common Cortex use case: <code>defineAgent</code> with an <code>outputSchema</code>, one call,
        fully-typed result. Cortex parses the JSON, validates it against the schema, and (if validation fails)
        auto-retries with the issue fed back into the prompt.
      </DemoBanner>

      <Section title="Input text" body={inputText} />

      <RunButton
        label="Run extractor"
        runningLabel="Running extractor…"
        onRun={() => void run()}
        isRunning={isRunning}
      />

      <RetriesPanel
        attempts={attempts}
        outcome={isDone ? 'corrected' : isError ? 'failed' : 'pending'}
      />

      {isError && <Section title="Error" body={status.message} variant="error" />}

      {isDone && (
        <>
          <Section
            title={`Extracted (${status.durationMs}ms)`}
            body={JSON.stringify(status.result, null, 2)}
            variant="pass"
          />
          {expectedFields !== undefined && (
            <Section
              title="Expected fields (sanity check)"
              body={JSON.stringify(expectedFields, null, 2)}
              variant="muted"
            />
          )}
        </>
      )}
    </div>
  );
};
