import { z } from 'zod';
import type { CortexEvent, RunHandle, SignalClient } from '@niscorp/cortex';
import { VexError } from '@niscorp/vex';
import type { GenerateDsl, Query } from '@niscorp/vex';
import { createQueryTools, describeCaller, vexQueryDslAgent } from '@niscorp/vex/agent';
import { lookCall, summary, testCall } from './trace';
import type { Tracer } from './trace';

// THE QUERY WRITER, WATCHED. Vex's own generation hook runs its query agent
// and keeps the run to itself; this is the same hook — the same agent, the
// same tools, the same caller line, the same refusals — with a listener on the
// run, so every tool call and what came back goes into the trace the stage
// draws. Nothing about how the query is written changes: the agent and its
// tools are vex's, imported.

const TestAnswerSchema = z.object({ rows: z.array(z.unknown()), sql: z.string(), errors: z.array(z.string()) });

const reasonFrom = (args: unknown): string | undefined => {
  if (typeof args !== 'object' || args === null) return undefined;
  const reason = (args as Record<string, unknown>)['reason'];
  return typeof reason === 'string' ? reason : undefined;
};

export const watchedQueryDsl = ({ llm, dslSchema, tracer }: { llm: SignalClient; dslSchema: object; tracer: Tracer }): GenerateDsl => {
  return async (request, schema, caller) => {
    const intent = request.intent ?? '';
    const callerLine = describeCaller(caller.bindings);

    const tools = createQueryTools({ getSchema: () => schema, read: caller.read });
    let unsatisfiable: string | undefined;
    let run: RunHandle<Query> | undefined;
    run = vexQueryDslAgent.run(
      { intent: request.intent, shape: request.shape, contextKeys: Object.keys(request.context) },
      {
        llm,
        deps: { schemaJson: JSON.stringify(schema), dslSpecJson: JSON.stringify(dslSchema), caller: callerLine },
        tools,
        onEvent: (event: CortexEvent) => {
          if (event.type !== 'tool-end') return;
          const seen = event.observation;
          if (seen.kind === 'result' && seen.toolId === 'cannotSatisfy') {
            unsatisfiable = reasonFrom(seen.args) ?? 'request cannot be satisfied';
            run?.abort();
            return;
          }
          const ms = 'durationMs' in seen ? seen.durationMs : 0;
          if (seen.kind === 'result' && seen.toolId === 'testQuery') {
            const answer = TestAnswerSchema.safeParse(seen.result);
            if (answer.success) {
              tracer.called(intent, testCall(seen.args, { errors: answer.data.errors, rows: answer.data.rows.length }));
              return;
            }
          }
          const result = seen.kind === 'result' ? summary(seen.result) : seen.kind === 'error' ? seen.error : seen.kind === 'denied' ? seen.reason : 'unknown tool';
          tracer.called(intent, lookCall(seen.toolId, seen.args, result, ms));
        },
      },
    );

    const result = await run.result;
    if (!result.ok) {
      if (unsatisfiable !== undefined) {
        tracer.refused(intent, unsatisfiable);
        throw new VexError('unsatisfiable', unsatisfiable);
      }
      tracer.refused(intent, result.error.message);
      throw new VexError('agent_failed', `${result.error.code}: ${result.error.message}`);
    }
    tracer.written(intent);
    return result.output.data;
  };
};
