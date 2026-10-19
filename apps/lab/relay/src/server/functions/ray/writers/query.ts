import { VexError, type GenerateDsl } from '@niscorp/vex';
import { createQueryTools, describeCaller, vexQueryDslAgent } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import { compactSchema } from './compact';
import { storedShape } from './declared';

const reasonOf = (args: unknown): string => {
  const reason = args !== null && typeof args === 'object' ? (args as Record<string, unknown>)['reason'] : undefined;
  return typeof reason === 'string' ? reason : 'request cannot be satisfied';
};

// vex's own query agent, reading the schema and the DSL as compact text (`spec` is compactSpec of vex's DSL schema);
// a shape with declared fields asks it only for the stored fields they read.
export const queryWriter = (llm: SignalClient, spec: string): GenerateDsl => {
  return async (request, schema, caller) => {
    const stored = storedShape(request.shape);
    const intent = stored.declared ? `${request.intent ?? ''}\nReturn the stored fields the shape names; how a field is shown is worked out from them after the query.` : request.intent;
    let unsatisfiable: string | undefined;
    let run: ReturnType<typeof vexQueryDslAgent.run> | undefined;
    run = vexQueryDslAgent.run(
      { intent, shape: stored.shape, contextKeys: Object.keys(request.context) },
      {
        llm,
        deps: { schemaJson: compactSchema(schema), dslSpecJson: spec, caller: describeCaller(caller.bindings) },
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
