import { createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import type { FunctionSession } from '@niscorp/moss';
import { llmFor, type AgentRole } from '@relay/server/llm';

// The DSL schema is static: an engine over a pool nothing asks yields it without a database.
export const DSL_SCHEMA = createQueryEngine({ adapter: createPostgresAdapter({ pool: { query: () => Promise.reject(new Error('unused')) } }) }).getDslSchema();

const llmOf = (role: AgentRole): SignalClient => {
  const resolved = llmFor(role);
  if ('error' in resolved) throw new Error(resolved.error);
  return resolved.llm;
};

// Resolved at each call, so the model assigned in Settings is the one that answers.
export const intentWriters = (): Parameters<FunctionSession['answerIntent']>[0] => ({
  generateDsl: (request, schema, caller) => createQueryDsl({ llm: llmOf('query'), queryJsonSchema: DSL_SCHEMA })(request, schema, caller),
  mapToShape: (rows, shape, intent) => createShapeMapper(llmOf('shape'))(rows, shape, intent),
});
