import { mappingAgent } from '@niscorp/prism/agent';
import type { Operation } from '../engine/contracts.js';
import { defineOperation } from '../engine/operation.js';
import { DiscoveryModelInputSchema, runModelAgent, type ModelOperationOptions } from './model.js';
import { ModelResultSchema } from './model-result.schema.js';

/** Haptic supplies job context; the published Prism agent owns mapping authoring. */
export const createPrismMappingOperation = (options: ModelOperationOptions): Operation =>
  defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: DiscoveryModelInputSchema.omit({ instructions: true }),
    output: ModelResultSchema,
    run(request, { signal }) {
      return runModelAgent({
        ...options,
        agent: mappingAgent,
        request,
        signal,
      });
    },
  });
