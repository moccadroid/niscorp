import { createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import type { FunctionSession } from '@niscorp/moss';
import type { Decider } from '@relay/context-selection';
import { llmFor, type AgentRole } from '@relay/server/llm';
import { compactSpec } from './compact';
import { queryWriter, type EntitySelection } from './query';
import { shapeWriter } from './shape';

export { compactSchema, compactSpec } from './compact';
export { declaredMapping, storedShape } from './declared';
export { queryWriter, shapeWriter, type EntitySelection };

// The DSL schema is static: an engine over a pool nothing asks yields it without a database.
export const DSL_SCHEMA = createQueryEngine({ adapter: createPostgresAdapter({ pool: { query: () => Promise.reject(new Error('unused')) } }) }).getDslSchema();
export const DSL_SPEC = compactSpec(DSL_SCHEMA);

const llmOf = (role: AgentRole): SignalClient => {
  const resolved = llmFor(role);
  if ('error' in resolved) throw new Error(resolved.error);
  return resolved.llm;
};

let decider: Decider | undefined;

// Jev picks the entities a query needs when relay has a key for it; without one the query writer reads them all.
// Read at the first call: the server loads its .env after this module is evaluated.
export const entitySelection = (): EntitySelection | undefined => {
  if ((process.env['TYPESAFE_API_KEY'] ?? '') === '') return undefined;
  decider ??= createSignal('typesafe');
  return { decider };
};

// Resolved at each call, so the model assigned in Settings is the one that answers.
export const intentWriters = (): Parameters<FunctionSession['answerIntent']>[0] => ({
  generateDsl: (request, schema, caller) => queryWriter(llmOf('query'), DSL_SPEC, entitySelection())(request, schema, caller),
  mapToShape: (rows, shape, intent) => shapeWriter(llmOf('shape'))(rows, shape, intent),
});
