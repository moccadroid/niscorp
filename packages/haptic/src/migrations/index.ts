import { ArtifactSchema, FlowSchema, StepSchema } from '../engine/index.js';
export { ENGINE_SEQUENCE } from '../engine/index.js';
export const ENGINE_SCHEMAS = {
  'eden.engine/artifact': ArtifactSchema,
  'eden.engine/flow': FlowSchema,
  'eden.engine/step': StepSchema,
} as const;
