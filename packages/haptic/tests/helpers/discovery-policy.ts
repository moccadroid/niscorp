import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../../src/index.js';
import {
  discoveryWorkflow,
  discoveryProfile,
  HtmlAuthorOutputSchema,
} from '../../src/discovery/index.js';
import { createHtmlMeasureOperation } from '../../src/discovery/html-measure.js';
import { HttpSourceSchema } from '../../src/operations/http-source.js';
import { HtmlDiagnosticPolicySchema } from '../../src/discovery/html-match-diagnostics.js';
import { HtmlContextPolicySchema } from '../../src/discovery/html-context.js';
import type { JsonValue } from '../../src/engine/contracts.js';

export const preparePolicy = async (id: string): ReturnType<typeof prepareArtifact> => {
  const flow = discoveryWorkflow.flows.find((f) => f.id === id);
  assert(flow);
  return prepareArtifact(
    {
      stamp: discoveryWorkflow.stamp,
      flow: flow.flow,
      flows: discoveryWorkflow.flows.filter((f) =>
        ['precondition-admission', 'task-result', 'html-candidate-admission'].includes(f.id),
      ),
    },
    {},
    discoveryProfile.engine,
  );
};
const admission = await preparePolicy('html-candidate-admission');
const measure = createHtmlMeasureOperation();
export const checkHtmlCandidate = async (input: {
  sources: z.infer<typeof HttpSourceSchema>[];
  rules: z.input<typeof HtmlAuthorOutputSchema>;
  authoring?: typeof discoveryProfile.authoring;
  minimumResultMatches?: number;
  diagnostics?: z.infer<typeof HtmlDiagnosticPolicySchema> | null;
  contextPolicy?: z.infer<typeof HtmlContextPolicySchema>;
  signal?: AbortSignal;
}): Promise<{ accepted: boolean; feedback: JsonValue; facts: JsonValue }> => {
  const rules = HtmlAuthorOutputSchema.parse(input.rules);
  const signal = input.signal ?? new AbortController().signal;
  const facts = await measure.run(
    {
      sources: input.sources,
      queries: [
        ...(['selector', 'links'] as const).flatMap((id) =>
          rules[id] === null
            ? []
            : [
                {
                  id,
                  selector: rules[id],
                  fields: id === 'selector' ? (rules.fields ?? null) : null,
                  anchors: rules.preconditions.map((p) => p.selector),
                },
              ],
        ),
      ],
      diagnostics:
        input.diagnostics === undefined ? discoveryProfile.diagnostics : input.diagnostics,
      contextPolicy: input.contextPolicy ?? discoveryProfile.htmlContext.policy,
    },
    { signal },
  );
  const outcome = await admission.run(
    {
      rules,
      facts,
      context: {
        canFollow: true,
        canFetch: true,
        task: { requiresNavigation: false, resultFlow: rules.result?.flow ?? null },
        resultFlows: discoveryProfile.resultFlows,
        authoring: input.authoring ?? discoveryProfile.authoring,
        minimumResultMatches: input.minimumResultMatches ?? 0,
      },
    },
    { signal },
  );
  assert.equal(outcome.status, 'completed');
  const { feedback } = z.object({ feedback: z.json() }).parse(outcome.value);
  return { accepted: feedback === null, feedback, facts };
};
