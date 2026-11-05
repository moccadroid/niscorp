import { z } from 'zod';
import { PrismError, ErrorCode as PrismErrorCode } from '@niscorp/prism';
import { defineOperation } from '../engine/operation.js';
import { prepareArtifact } from '../engine/prepare.js';
import { ArtifactError } from '../engine/errors.js';
import type { Operation, Operations, JsonValue } from '../engine/contracts.js';
import { LimitsSchema, type LimitsInput } from '../engine/schema.js';

export const TrialResultSchema = z.object({
  status: z.enum(['completed', 'failed', 'rejected', 'skipped']),
  value: z.json(),
  error: z.json(),
});

const rejection = (error: unknown): z.infer<typeof TrialResultSchema> => {
  if (error instanceof PrismError && error.code === PrismErrorCode.BUDGET) throw error;
  if (
    !(error instanceof ArtifactError) &&
    !(error instanceof PrismError) &&
    !(error instanceof z.ZodError)
  )
    throw error;
  return {
    status: 'rejected',
    value: null,
    error: {
      code: error instanceof z.ZodError ? 'CONTRACT_VALIDATION' : error.code,
      message: error.message,
      ...(error instanceof PrismError && typeof error.context?.op === 'string'
        ? { op: error.context.op }
        : {}),
      ...(error instanceof ArtifactError
        ? { path: error.path }
        : error instanceof PrismError && typeof error.context?.path === 'string'
          ? { path: error.context.path }
          : {}),
    },
  };
};

export const createTrialOperation = (
  mechanical: Operations,
  inputLimits: LimitsInput,
  record?: (event: JsonValue) => void,
): Operation => {
  const limits = LimitsSchema.parse(inputLimits);
  return defineOperation({
    maxJsonDepth: limits.maxJsonDepth,
    input: z
      .object({
        artifact: z.json(),
        cases: z
          .array(z.object({ id: z.string().min(1), input: z.json() }).strict())
          .max(limits.maxItems),
      })
      .strict(),
    output: z.object({ outcomes: z.array(TrialResultSchema.extend({ id: z.string() })) }).strict(),
    async run(request, { signal }) {
      let prepared;
      try {
        prepared = await prepareArtifact(request.artifact, mechanical, limits);
      } catch (error) {
        signal.throwIfAborted();
        const outcome = rejection(error);
        const outcomes = request.cases.map((item) => ({ id: item.id, ...outcome }));
        for (const [index, item] of request.cases.entries())
          record?.(
            structuredClone({
              kind: 'artifact-trial',
              id: item.id,
              artifact: request.artifact,
              input: item.input,
              outcome: outcomes[index] ?? null,
            }),
          );
        signal.throwIfAborted();
        return { outcomes };
      }
      const outcomes = [];
      for (const item of request.cases) {
        signal.throwIfAborted();
        let outcome;
        try {
          outcome = { id: item.id, ...(await prepared.run(item.input, { signal })) };
        } catch (error) {
          signal.throwIfAborted();
          outcome = { id: item.id, ...rejection(error) };
        }
        record?.(
          structuredClone({
            kind: 'artifact-trial',
            id: item.id,
            artifact: request.artifact,
            input: item.input,
            outcome,
          }),
        );
        signal.throwIfAborted();
        outcomes.push(outcome);
      }
      signal.throwIfAborted();
      return { outcomes };
    },
  });
};

/** Preparation admits schemas and expressions without executing effects. */
export const createPrepareOperation = (
  mechanical: Operations,
  inputLimits: LimitsInput,
): Operation => {
  const limits = LimitsSchema.parse(inputLimits);
  return defineOperation({
    maxJsonDepth: limits.maxJsonDepth,
    input: z.object({ artifact: z.json() }).strict(),
    output: z.null(),
    async run(request, { signal }) {
      signal.throwIfAborted();
      await prepareArtifact(request.artifact, mechanical, limits);
      signal.throwIfAborted();
      return null;
    },
  });
};
