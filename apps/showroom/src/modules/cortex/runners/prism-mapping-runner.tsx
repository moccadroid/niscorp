import { useCallback, useEffect, useState, type FC } from 'react';
import { createSignal } from '@niscorp/signal';
import { runAgentStandalone, type SignalClient, type CortexError } from '@niscorp/cortex';
import { mappingAgent, type MappingAgentOutput } from '@niscorp/prism/agent';
import { evaluateSafe, type JsonValue } from '@niscorp/prism';
import { isPrismMappingStory } from '../story-types';
import { useCortexRuntime, type LastRun } from '../runtime-context';
import { recordRun } from '../run-history';
import { getKey } from '../../signal/settings/api-key-storage';
import { createOpenAIClient } from '../../signal/openai-client';
import {
  DEFAULT_MODEL,
  DemoBanner,
  PassFailBadge,
  PROVIDER,
  RetriesPanel,
  RunButton,
  Section,
  deepEqual,
  type RetryAttempt,
} from './runner-shell';

// ═══════════════════════════════════════════════════════════
// Prism mapping demo runner
// ═══════════════════════════════════════════════════════════
//
// What it shows: Cortex's `outputMode: 'structured'` with a deeply
// nested output schema. The agent's MappingAgentOutputSchema embeds
// Prism's ConfigSchema directly, so Cortex validates the entire tree
// (including every Prism Node op) end-to-end on every call. Validation
// failures auto-retry with the prior attempt fed back into the prompt.
//
// What it does NOT show: Prism. Prism is the example payload, not the
// thing being demonstrated. The same shape works for any deeply
// validated structured output (forms, IRs, schemas, etc.).

type RunStatus =
  | { phase: 'idle' }
  | { phase: 'running'; attempts: RetryAttempt[] }
  | { phase: 'error'; message: string; rawModelOutput?: unknown; attempts: RetryAttempt[] }
  | { phase: 'done'; result: LastRun; attempts: RetryAttempt[] };

type Props = { story: unknown };

export const PrismMappingRunner: FC<Props> = ({ story }) => {
  const { setLastRun } = useCortexRuntime();
  const [status, setStatus] = useState<RunStatus>({ phase: 'idle' });

  const storyId = isPrismMappingStory(story) ? story.id : undefined;
  useEffect(() => {
    setStatus({ phase: 'idle' });
  }, [storyId]);

  // Persist the run outcome to localStorage so the sidebar dot
  // updates. For prism-mapping the "pass" semantic is: the run
  // produced a result AND the evaluated output matched expected.
  useEffect(() => {
    if (storyId === undefined) return;
    if (status.phase === 'done') {
      recordRun(storyId, status.result.matchesExpected ? 'pass' : 'fail');
    } else if (status.phase === 'error') {
      recordRun(storyId, 'fail');
    }
  }, [storyId, status]);

  const run = useCallback(async (): Promise<void> => {
    if (!isPrismMappingStory(story)) return;
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

    const client = createOpenAIClient('groq', apiKey);
    const signal = createSignal('groq', { client, model: DEFAULT_MODEL, apiKey });
    const llm: SignalClient = signal;

    const result = await runAgentStandalone<MappingAgentOutput>(
      mappingAgent,
      {
        sampleInput: story.sampleInput,
        targetShape: story.expected,
        ...(story.fieldDescriptions && { fieldDescriptions: story.fieldDescriptions }),
        ...(story.notes && { notes: story.notes }),
      },
      {
        llm,
        onRetry: (payload) => {
          attempts.push({
            attempt: payload.attempt,
            rawContent: payload.rawContent,
            error: payload.error as CortexError,
          });
          setStatus({ phase: 'running', attempts: attempts.slice() });
        },
      },
    );

    if (!result.ok) {
      setStatus({ phase: 'error', message: `${result.error.code}: ${result.error.message}`, attempts });
      return;
    }

    const { config, reasoning } = result.data;
    const evalResult = evaluateSafe(config, story.sampleInput);
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
    const matches = deepEqual(evaluated, story.expected);
    const lastRun: LastRun = {
      storyId: story.id,
      config,
      ...(reasoning && { reasoning }),
      evaluated,
      matchesExpected: matches,
      durationMs: Date.now() - start,
    };
    setLastRun(lastRun);
    setStatus({ phase: 'done', result: lastRun, attempts });
  }, [story, setLastRun]);

  if (!isPrismMappingStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a prism-mapping story.</div>;
  }

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
        prior attempt fed back into the prompt. <strong>The point is the substrate, not the Prism payload.</strong>
      </DemoBanner>

      <Section title="Sample input" body={JSON.stringify(story.sampleInput, null, 2)} />
      <Section title="Expected output" body={JSON.stringify(story.expected, null, 2)} />

      {story.fieldDescriptions !== undefined && (
        <Section
          title="Hints sent to the agent (optional per-field guidance)"
          body={JSON.stringify(story.fieldDescriptions, null, 2)}
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

      {isDone && (
        <>
          <Section title="Generated Prism config" body={JSON.stringify(status.result.config, null, 2)} />
          {status.result.reasoning !== undefined && (
            <Section title="Agent reasoning" body={status.result.reasoning} variant="muted" />
          )}
          <Section
            title="Evaluated output"
            body={JSON.stringify(status.result.evaluated, null, 2)}
            variant={status.result.matchesExpected ? 'pass' : 'fail'}
          />
          <PassFailBadge
            pass={status.result.matchesExpected}
            passLabel={`Output matches expected (${status.result.durationMs}ms)`}
            failLabel={`Output does not match expected (${status.result.durationMs}ms)`}
          />
        </>
      )}
    </div>
  );
};
