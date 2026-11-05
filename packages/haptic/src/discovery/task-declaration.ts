import type { Operation } from '../engine/contracts.js';
import { createModelOperation, type ModelOperationOptions } from './model.js';
import { TaskDeclarationSchema } from './rules.schema.js';
export { TaskDeclarationSchema } from './rules.schema.js';

export const createTaskDeclarationOperation = (options: ModelOperationOptions): Operation =>
  createModelOperation(TaskDeclarationSchema, options);
