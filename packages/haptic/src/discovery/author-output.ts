import { z } from 'zod';
import { SignalError, type StepResult, type StepRequest } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { RunControl } from '../engine/control.js';
import { readOutputRejection, type OutputRejections } from './output-rejection.js';
import { readProviderBlock, type ModelTransport, type ProviderBlock } from './model-transport.js';

export interface AuthorOutputSource {
  channel: 'content' | 'tool-arguments' | 'failed-generation';
  text: string;
}

/** Keep provider-authored values before Signal/Cortex's JSON repair/decoding. */
export const readAuthorOutputSources = (step: StepResult): AuthorOutputSource[] => {
  if (step.outcome?.kind !== 'output') return [];
  const sources: AuthorOutputSource[] = [];
  if (step.content) sources.push({ channel: 'content', text: step.content });
  const raw = step.raw instanceof SignalError ? step.raw.context?.raw : step.raw;
  const failure = z.object({ error: z.object({ failed_generation: z.string() }) }).safeParse(raw);
  if (failure.success)
    sources.push({ channel: 'failed-generation', text: failure.data.error.failed_generation });
  return sources;
};

/** Observe output and translate configured provider rejections into Signal's failed outcome. */
export const observeAuthorOutput = (
  client: SignalClient,
  receive: (sources: AuthorOutputSource[]) => void,
  maxInputBytes?: number,
  rejections?: {
    rules: OutputRejections;
    record?: (value: { code: string | null; status: number | null; generation?: string }) => void;
  },
  usageUnavailable?: () => void,
  blocking?: {
    policy: ModelTransport;
    receive(error: ProviderBlock): void;
    observed?: (signal: AbortSignal) => ProviderBlock | null;
  },
): SignalClient => {
  const admit = (request: StepRequest): void => {
    // output.accept is Signal's local validator; it is not provider input.
    const { output: _output, ...input } = request;
    if (maxInputBytes !== undefined && Buffer.byteLength(JSON.stringify(input)) > maxInputBytes)
      throw new RunControl(
        'MODEL_INPUT_BYTES',
        'Model request exceeds its configured byte allowance',
      );
  };
  const recover = (cause: unknown): StepResult => {
    usageUnavailable?.();
    const blocked = blocking && readProviderBlock(cause, blocking.policy);
    if (blocked) {
      blocking?.receive(blocked);
      throw cause;
    }
    const rejection = rejections && readOutputRejection(cause, rejections.rules);
    if (!rejection) throw cause;
    const { result, ...facts } = rejection;
    rejections.record?.(facts);
    return result;
  };
  return {
    describe: () => client.describe(),
    count: (input) => client.count(input),
    step: async (request) => {
      admit(request);
      const result = await client.step(request).catch(recover);
      receive(readAuthorOutputSources(result));
      return result;
    },
    async *stepStream(request, options) {
      admit(request);
      const argumentsByIndex = new Map<number, string>();
      let completed = false;
      try {
        for await (const event of client.stepStream(request, options)) {
          if (event.type === 'tool_call_delta')
            argumentsByIndex.set(
              event.index,
              (argumentsByIndex.get(event.index) ?? '') + event.argsText,
            );
          if (event.type === 'done') {
            completed = true;
            const sources = readAuthorOutputSources(event.result);
            if (event.result.outcome?.kind === 'output')
              for (const text of argumentsByIndex.values())
                sources.push({ channel: 'tool-arguments', text });
            receive(sources);
          }
          yield event;
        }
      } catch (cause) {
        if (completed) throw cause;
        const blocked = blocking && readProviderBlock(cause, blocking.policy);
        if (blocked) {
          usageUnavailable?.();
          blocking?.receive(blocked);
        }
        options?.signal?.throwIfAborted();
        yield { type: 'done', result: recover(cause) };
      } finally {
        if (!completed && options?.signal?.aborted) {
          const blocked = blocking?.observed?.(options.signal);
          if (blocked) {
            usageUnavailable?.();
            blocking?.receive(blocked);
          }
        }
      }
    },
  };
};
