import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact, defineOperation } from '../src/index.js';
import { ArtifactSchema } from '../src/engine/schema.js';
import { discoveryProfile, discoveryWorkflow } from '../src/discovery/index.js';
import { blueprint, builderContracts } from '../src/discovery/blueprint.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import type { JsonValue } from '../src/engine/contracts.js';

const binder = async (id: string, input: unknown) => {
  const program = await prepareArtifact(
    {
      stamp: discoveryWorkflow.stamp,
      flows: discoveryWorkflow.flows.filter((flow) =>
        [id, 'precondition-admission'].includes(flow.id),
      ),
      flow: {
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        steps: [{ id: 'bound', call: { flow: { id, revision: 1 } }, input: { $ref: '$.input' } }],
        output: { $ref: '$.steps.bound.value' },
      },
    },
    {},
  );
  const result = await program.run(input);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return ArtifactSchema.parse(result.value);
};

const task = { requiresNavigation: false, resultFlow: null };
const rule = { preconditions: [], selector: 'main p', links: null, result: null };
const policy = { ...discoveryProfile.traversal, allowLinkFollowing: true };
const bind = (stages: JsonValue[]) =>
  binder('bind', {
    mode: 'walk',
    stages,
    task,
    policy,
    canFollow: true,
    minimumResultMatches: 0,
    seen: [],
    resources: discoveryProfile.resources,
    formats: discoveryProfile.formats,
    blueprint,
  });

const web = createWebOperations();
const originalGet = web.operations['http.get'];
assert(originalGet);
const pages = new Map<string, { type: string; text: string }>();
const acquired: string[] = [];
const operations = {
  ...web.operations,
  'http.get': {
    ...originalGet,
    async run(input: unknown) {
      const { url } = z.object({ url: z.string() }).parse(input);
      acquired.push(url);
      const page = pages.get(url);
      assert(page, 'Unexpected acquisition: ' + url);
      const body = captureBody(Buffer.from(page.text));
      return { url, status: 200, headers: { 'content-type': [page.type] }, body, encoded: body };
    },
  },
};

try {
  const documentArtifact = await binder('bind-document', {
    blueprint,
    readFlow: { id: 'read-json', revision: 1 },
    readInput: { policy, formats: discoveryProfile.formats },
    runtimeFlows: blueprint.jsonFlows,
  });
  pages.set('https://source.invalid/data', { type: 'application/json', text: '{"current":42}' });
  const documentRun = await (
    await prepareArtifact(documentArtifact, operations)
  ).run({
    url: 'https://source.invalid/data',
  });
  assert.equal(documentRun.status, 'completed', JSON.stringify(documentRun));
  assert.deepEqual(z.object({ document: z.json() }).parse(documentRun.value).document, {
    current: 42,
  });
  console.log(
    '[pass] binding: assembled document artifact reads current JSON without authoring operations',
  );

  const htmlArtifact = await bind([rule]);
  const source = htmlArtifact.flows?.find((flow) => flow.id === 'output-source');
  assert(source);
  const shaped = await binder('bind-output', {
    artifact: htmlArtifact,
    shapedFlow: blueprint.execution.shaped,
    mapping: { $ref: '$.input.records' },
    outputSchema: { type: 'array' },
    sourceFlow: { id: source.id, revision: source.revision },
  });
  pages.set('https://source.invalid/page', {
    type: 'text/html',
    text: '<main><p>Current</p></main>',
  });
  const shapedRun = await (
    await prepareArtifact(shaped, operations)
  ).run({
    url: 'https://source.invalid/page',
  });
  assert.equal(shapedRun.status, 'completed', JSON.stringify(shapedRun));
  assert.equal(z.object({ data: z.array(z.json()) }).parse(shapedRun.value).data.length, 1);
  console.log('[pass] binding: assembled HTML artifact executes with only mechanical operations');

  const referenceArtifact = await bind([
    {
      preconditions: [],
      selector: null,
      links: null,
      result: null,
      reference: {
        id: 'document-reference:0',
        format: 'json',
        xml: null,
        mapping: { links: { $ref: '$.input.document.links' }, resources: [] },
      },
    },
    rule,
  ]);
  pages.set('https://source.invalid/index', {
    type: 'application/json',
    text: '{"links":["/page"]}',
  });
  acquired.length = 0;
  const referenceRun = await (
    await prepareArtifact(referenceArtifact, operations)
  ).run({
    url: 'https://source.invalid/index',
  });
  assert.equal(referenceRun.status, 'completed', JSON.stringify(referenceRun));
  assert.deepEqual(acquired, ['https://source.invalid/index', 'https://source.invalid/page']);
  console.log('[pass] binding: assembled reference artifact follows current links without AI');
} finally {
  web.close();
}

for (const [helper, input] of [
  ['build-source', { depth: 0, levels: [], focus: { stage: 0, part: 'finish' } }],
  [
    'spend-model',
    {
      state: { budget: { author: { steps: 2, ms: 5 }, review: { steps: 2, ms: 5 } } },
      owner: 'reviewer',
      model: {},
    },
  ],
] as const) {
  const contract = builderContracts[helper];
  assert(contract);
  let effects = 0;
  const probe = await prepareArtifact(
    {
      stamp: discoveryWorkflow.stamp,
      flow: {
        ...contract,
        steps: [{ id: 'effect', call: { operation: 'effect' }, input: null }],
        output: null,
      },
    },
    {
      effect: defineOperation({
        input: z.null(),
        output: z.null(),
        run: () => {
          effects++;
          return null;
        },
      }),
    },
  );
  await assert.rejects(probe.run(input), { code: 'INVALID_VALUE' });
  assert.equal(effects, 0);
}
console.log(
  '[pass] binding: unknown source jobs and budget owners fail schema admission before effects',
);
