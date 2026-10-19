import { VexError, type DatabaseSchema, type GenerateDsl } from '@niscorp/vex';
import { createQueryTools, describeCaller, vexQueryDslAgent } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import { selectContext, type Decider, type Selection } from '@relay/context-selection';
import { compactSchema } from './compact';
import { storedShape } from './declared';

const reasonOf = (args: unknown): string => {
  const reason = args !== null && typeof args === 'object' ? (args as Record<string, unknown>)['reason'] : undefined;
  return typeof reason === 'string' ? reason : 'request cannot be satisfied';
};

export type EntitySelection = { decider: Decider; onSelect?: (selection: Selection) => void };

// The entities a request needs, picked by a decision model, with the ones they belong to; the rest are named, and
// the agent reads any of them with its getSchema tool.
const schemaText = async (schema: DatabaseSchema, request: unknown, selection: EntitySelection | undefined): Promise<string> => {
  if (selection === undefined) return compactSchema(schema);
  const chosen = await selectContext({
    decider: selection.decider,
    request,
    noun: 'entity',
    pieces: schema.entities.map((entity) => {
      const text = compactSchema({ ...schema, entities: [entity] });
      return { id: entity.name, about: text.split('\n')[0] ?? entity.name, content: text, with: entity.relations.filter((relation) => relation.type === 'belongsTo').map((relation) => relation.entity) };
    }),
  });
  selection.onSelect?.(chosen);
  return chosen.left.length === 0 ? chosen.content : `${chosen.content}\nOther entities, not shown here — read one with getSchema: ${chosen.left.map((entity) => entity.id).join(', ')}`;
};

// vex's own query agent, reading the schema and the DSL as compact text (`spec` is compactSpec of vex's DSL schema);
// a shape with declared fields asks it only for the stored fields they read.
export const queryWriter = (llm: SignalClient, spec: string, selection?: EntitySelection): GenerateDsl => {
  return async (request, schema, caller) => {
    const stored = storedShape(request.shape);
    const intent = stored.declared ? `${request.intent ?? ''}\nReturn the stored fields the shape names; how a field is shown is worked out from them after the query.` : request.intent;
    const schemaJson = await schemaText(schema, { intent: request.intent, shape: stored.shape }, selection);
    let unsatisfiable: string | undefined;
    let run: ReturnType<typeof vexQueryDslAgent.run> | undefined;
    run = vexQueryDslAgent.run(
      { intent, shape: stored.shape, contextKeys: Object.keys(request.context) },
      {
        llm,
        deps: { schemaJson, dslSpecJson: spec, caller: describeCaller(caller.bindings) },
        tools: createQueryTools({ getSchema: () => schema, read: caller.read }),
        onEvent: (event) => {
          if (event.type === 'tool-end' && event.observation.kind === 'result' && event.observation.toolId === 'cannotSatisfy') {
            unsatisfiable = reasonOf(event.observation.args);
            run?.abort();
          }
        },
      },
    );
    const result = await run.result;
    if (!result.ok) throw new VexError(unsatisfiable === undefined ? 'agent_failed' : 'unsatisfiable', unsatisfiable ?? `${result.error.code}: ${result.error.message}`);
    return result.output.data;
  };
};
