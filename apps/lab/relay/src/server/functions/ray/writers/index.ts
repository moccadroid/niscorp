import { createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import type { SignalClient } from '@niscorp/cortex';
import type { FunctionSession } from '@niscorp/moss';
import { llmFor, type AgentRole } from '@relay/server/llm';
import { compactSpec } from './compact';
import { queryWriter } from './query';
import { shapeWriter } from './shape';

export { compactSchema, compactSpec } from './compact';
export { declaredMapping, storedShape } from './declared';
export { queryWriter, shapeWriter };

// The DSL schema is static: an engine over a pool nothing asks yields it without a database.
export const DSL_SCHEMA = createQueryEngine({ adapter: createPostgresAdapter({ pool: { query: () => Promise.reject(new Error('unused')) } }) }).getDslSchema();
export const DSL_SPEC = compactSpec(DSL_SCHEMA);

const llmOf = (role: AgentRole): SignalClient => {
  const resolved = llmFor(role);
  if ('error' in resolved) throw new Error(resolved.error);
  return resolved.llm;
};

// Resolved at each call, so the model assigned in Settings is the one that answers.
export const intentWriters = (): Parameters<FunctionSession['answerIntent']>[0] => ({
  generateDsl: (request, schema, caller) => queryWriter(llmOf('query'), DSL_SPEC)(request, schema, caller),
  mapToShape: (rows, shape, intent) => shapeWriter(llmOf('shape'))(rows, shape, intent),
});
