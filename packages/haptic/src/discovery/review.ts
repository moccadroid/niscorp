import { z } from 'zod';
import type { Operation } from '../engine/contracts.js';
import { createModelOperation, type ModelOperationOptions } from './model.js';
import { defineOperation } from '../engine/operation.js';
import { ReviewResponseSchema } from './review.schema.js';

export const createReviewOperation = (options: ModelOperationOptions): Operation =>
  createModelOperation(ReviewResponseSchema, options);

/** JSON wire encoding preserves scalar identity; string coercion would drop string quotes. */
export const createJsonEncodingOperation = (maxJsonDepth: number): Operation =>
  defineOperation({
    maxJsonDepth,
    input: z.json(),
    output: z.string(),
    run: (value) => JSON.stringify(value),
  });
