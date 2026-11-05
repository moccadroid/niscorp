import assert from 'node:assert/strict';
import { prepareArtifact } from '../src/index.js';
import { TaskDeclarationSchema } from '../src/discovery/index.js';
import { blueprint as mechanical } from '../src/discovery/blueprint.js';

const flow = mechanical.flows.find((flow) => flow.id === 'task-result');
assert(flow);
const prepared = await prepareArtifact({ stamp: mechanical.stamp, flow: flow.flow }, {});
const selected = { preconditions: [], selector: 'main a', links: null, result: null };
const fetching = {
  ...selected,
  result: {
    flow: { id: 'fetch-resources', revision: 1 },
    input: { reference: ['attributes', 'href'] },
  },
};
const navigation = { preconditions: [], selector: null, links: 'main a', result: null };
const cases = [
  {
    task: { requiresNavigation: false, resultFlow: null },
    rules: [selected],
    allowResourceFetching: true,
    accepted: true,
  },
  {
    task: { requiresNavigation: false, resultFlow: null },
    rules: [fetching],
    allowResourceFetching: true,
    accepted: false,
  },
  {
    task: { requiresNavigation: false, resultFlow: fetching.result.flow },
    rules: [fetching],
    allowResourceFetching: true,
    accepted: true,
  },
  {
    task: { requiresNavigation: false, resultFlow: fetching.result.flow },
    rules: [selected],
    allowResourceFetching: true,
    accepted: false,
  },
  {
    task: { requiresNavigation: false, resultFlow: fetching.result.flow },
    rules: [navigation, fetching],
    allowResourceFetching: true,
    accepted: true,
  },
  {
    task: { requiresNavigation: false, resultFlow: fetching.result.flow },
    rules: [fetching],
    allowResourceFetching: false,
    accepted: false,
  },
  {
    task: { requiresNavigation: false, resultFlow: fetching.result.flow },
    rules: [{ ...fetching, selector: null }],
    allowResourceFetching: true,
    accepted: false,
  },
  {
    task: { requiresNavigation: false, resultFlow: { id: 'another-capability', revision: 8 } },
    rules: [
      {
        ...fetching,
        result: { ...fetching.result, flow: { id: 'another-capability', revision: 8 } },
      },
    ],
    allowResourceFetching: true,
    accepted: true,
  },
  {
    task: { requiresNavigation: false, resultFlow: { id: 'fetch-resources', revision: 2 } },
    rules: [fetching],
    allowResourceFetching: true,
    accepted: false,
  },
];
for (const { accepted, ...input } of cases) {
  const outcome = await prepared.run(input);
  assert.equal(outcome.status, 'completed');
  assert.deepEqual(outcome.value, { accepted, task: input.task });
}
const inferredOutputSchema = { type: 'array', items: { type: 'string' } };
assert(!TaskDeclarationSchema.safeParse({ resultFlow: null, selector: 'a' }).success);
assert(!TaskDeclarationSchema.safeParse({ resultFlow: { id: 'x', revision: 0 } }).success);
assert(
  !TaskDeclarationSchema.safeParse({
    requiresNavigation: false,
    resultFlow: null,
    outputSchema: inferredOutputSchema,
  }).success,
  'Schema declaration must not expand the frozen execution task',
);
console.log(
  'Task declaration/admission: 9 shared-rule cases; strict action-only model contract passed.',
);
