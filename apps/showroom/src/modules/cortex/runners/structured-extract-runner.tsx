import { useCallback, useEffect, useState, type FC } from 'react';
import { createSignal } from '@niscorp/signal';
import { runAgentStandalone, type SignalClient, type CortexError } from '@niscorp/cortex';
import { isStructuredExtractStory } from '../story-types';
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
// Structured-extract runner
// ═══════════════════════════════════════════════════════════
//
// What it shows: Cortex's `outputMode: 'structured'` for the most
// common case — typed JSON out of a model call. No Prism, no plan
// mode, no tools. Just defineAgent + outputSchema, one call, fully
// typed Result<T>.

type RunStatus =
  | { phase: 'idle' }
  | { phase: 'running'; attempts: RetryAttempt[] }
  | { phase: 'error'; message: string; attempts: RetryAttempt[] }
  | { phase: 'done'; result: unknown; durationMs: number; attempts: RetryAttempt[] };

type Props = { story: unknown };

export const StructuredExtractRunner: FC<Props> = ({ story }) => {
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });

  const storyId = isStructuredExtractStory(story) ? story.id : undefined;
  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  // Persist outcome to localStorage so the sidebar dot updates.
  // For structured-extract a successful run is enough — we don't
  // do a deep correctness check on the result.
  useEffect(() => {
    if (storyId === undefined) return;
    if (status.phase === 'done') recordRun(storyId, 'pass');
    else if (status.phase === 'error') recordRun(storyId, 'fail');
  }, [storyId, status.phase]);

  const run = useCallback(async (): Promise<void> => {
    if (!isStructuredExtractStory(story)) return;
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

    const client = createOpenAIClient('groq', apiKey);
    const signal = createSignal('groq', { client, model: DEFAULT_MODEL, apiKey });
    const llm: SignalClient = signal;

    const result = await runAgentStandalone(story.agent, story.inputText, {
      llm,
      onRetry: (payload) => {
        attempts.push({
          attempt: payload.attempt,
          rawContent: payload.rawContent,
          error: payload.error as CortexError,
        });
        setStatus({ phase: 'running', attempts: attempts.slice() });
      },
    });

    if (!result.ok) {
      setStatus({ phase: 'error', message: `${result.error.code}: ${result.error.message}`, attempts });
      return;
    }
    setStatus({ phase: 'done', result: result.data, durationMs: Date.now() - start, attempts });
  }, [story]);

  if (!isStructuredExtractStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a structured-extract story.</div>;
  }

  const isDone = status.phase === 'done';
  const isError = status.phase === 'error';
  const isRunning = status.phase === 'running';
  const attempts = status.phase === 'idle' ? [] : status.attempts;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoBanner tag="Cortex demo · standalone · structured output">
        The most common Cortex use case: <code>defineAgent</code> with an <code>outputSchema</code>, one call,
        fully-typed result. Cortex parses the JSON, validates it against the schema, and (if validation fails)
        auto-retries with the issue fed back into the prompt.{' '}
        <strong>No tools. No plan mode. No setup beyond the agent definition.</strong>
      </DemoBanner>

      <Section title="Input text" body={story.inputText} />

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
          {story.expectedFields !== undefined && (
            <Section
              title="Expected fields (sanity check)"
              body={JSON.stringify(story.expectedFields, null, 2)}
              variant="muted"
            />
          )}
        </>
      )}
    </div>
  );
};
