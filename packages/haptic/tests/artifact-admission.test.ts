import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { ArtifactSchema } from '../src/engine/schema.js';
import { discoveryWorkflow, discoveryProfile } from '../src/discovery/index.js';
import { blueprint } from '../src/discovery/blueprint.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';

const bind = async (id: string, input: unknown) => {
  const flow = discoveryWorkflow.flows.find((entry) => entry.id === id);
  assert(flow);
  const program = await prepareArtifact(
    {
      stamp: discoveryWorkflow.stamp,
      flow: flow.flow,
      flows: discoveryWorkflow.flows.filter((entry) => entry.id === 'precondition-admission'),
    },
    {},
  );
  const result = await program.run(input);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return ArtifactSchema.parse(result.value);
};
const rule = {
  preconditions: [{ selector: 'main', minimum: 1, maximum: 1 }],
  selector: 'main article',
  links: null,
  result: null,
  fields: { label: { selector: 'h2', attribute: null, minimum: 1, maximum: 1 } },
};
const page = await bind('bind', {
  blueprint,
  mode: 'walk',
  stages: [rule],
  task: { requiresNavigation: false, resultFlow: null },
  policy: discoveryProfile.traversal,
  resources: discoveryProfile.resources,
  formats: discoveryProfile.formats,
  minimumResultMatches: 0,
});
const document = (format: 'json' | 'xml') =>
  bind('bind-document', {
    blueprint,
    readFlow: { id: 'read-' + format, revision: 1 },
    readInput: {
      policy: discoveryProfile.traversal,
      formats: discoveryProfile.formats,
      ...(format === 'xml'
        ? { rule: { selector: '/items/item', namespaces: {}, fields: { label: 'string(.)' } } }
        : {}),
    },
    runtimeFlows: format === 'xml' ? blueprint.xmlFlows : blueprint.jsonFlows,
  });
const json = await document('json'),
  xml = await document('xml');

// Replace one saved JSON value; the rest of the production-built document stays intact.
const replace = (
  value: unknown,
  path: readonly (string | number)[],
  replacement: unknown,
): unknown => {
  const [head, ...tail] = path;
  if (head === undefined) return replacement;
  if (Array.isArray(value)) {
    assert(typeof head === 'number' && head < value.length);
    return value.map((item, index) => (index === head ? replace(item, tail, replacement) : item));
  }
  assert(value && typeof value === 'object');
  if (tail.length === 0) return { ...value, [head]: replacement };
  assert(Object.hasOwn(value, head));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === head ? replace(item, tail, replacement) : item,
    ]),
  );
};

const cases: { name: string; artifact: unknown; path: (string | number)[]; value: unknown }[] = [
  { name: 'numeric result selector', artifact: page, path: ['rules', 0, 'selector'], value: 123 },
  { name: 'numeric navigation selector', artifact: page, path: ['rules', 0, 'links'], value: 123 },
  {
    name: 'invalid precondition',
    artifact: page,
    path: ['rules', 0, 'preconditions', 0, 'minimum'],
    value: 'one',
  },
  {
    name: 'invalid field selector',
    artifact: page,
    path: ['rules', 0, 'fields', 'label', 'selector'],
    value: 123,
  },
  {
    name: 'invalid field bound',
    artifact: page,
    path: ['rules', 0, 'fields', 'label', 'maximum'],
    value: -1,
  },
  {
    name: 'invalid resource reference',
    artifact: page,
    path: ['rules', 0, 'result'],
    value: { flow: { id: 'fetch-resources', revision: 1 }, input: { reference: [-1] } },
  },
  {
    name: 'invalid reference format',
    artifact: page,
    path: ['rules', 0, 'reference'],
    value: { id: 'ref', format: 'unknown', xml: null },
  },
  {
    name: 'invalid reference XML rule',
    artifact: page,
    path: ['rules', 0, 'reference'],
    value: { id: 'ref', format: 'xml', xml: { selector: 123, namespaces: {}, fields: {} } },
  },
  { name: 'invalid traversal allowance', artifact: page, path: ['policy', 'maxPages'], value: -1 },
  {
    name: 'invalid resource allowance',
    artifact: page,
    path: ['resources', 'maxResources'],
    value: 'four',
  },
  {
    name: 'invalid format catalog',
    artifact: page,
    path: ['formats', 0, 'mediaTypes', 0],
    value: 123,
  },
  { name: 'invalid execution mode', artifact: page, path: ['mode'], value: 'unknown' },
  { name: 'invalid following flag', artifact: page, path: ['canFollow'], value: 'yes' },
  { name: 'invalid match minimum', artifact: page, path: ['minimumResultMatches'], value: -1 },
  { name: 'invalid task', artifact: page, path: ['task', 'requiresNavigation'], value: 'yes' },
  {
    name: 'invalid JSON format catalog',
    artifact: json,
    path: ['readInput', 'formats'],
    value: null,
  },
  {
    name: 'invalid JSON redirect allowance',
    artifact: json,
    path: ['readInput', 'policy', 'maxRedirects'],
    value: 'three',
  },
  {
    name: 'invalid XML selector',
    artifact: xml,
    path: ['readInput', 'rule', 'selector'],
    value: 123,
  },
  {
    name: 'invalid XML namespaces',
    artifact: xml,
    path: ['readInput', 'rule', 'namespaces'],
    value: { n: 123 },
  },
  {
    name: 'invalid XML fields',
    artifact: xml,
    path: ['readInput', 'rule', 'fields'],
    value: { label: 123 },
  },
];
const web = createWebOperations();
const get = web.operations['http.get'];
assert(get);
let httpCalls = 0;
let source = '<main><article><h2>Current</h2></article></main>';
let mediaType = 'text/html';
const operations = {
  ...web.operations,
  'http.get': {
    ...get,
    async run(input: unknown) {
      httpCalls++;
      const { url } = z.object({ url: z.string() }).parse(input);
      const body = captureBody(Buffer.from(source));
      return { url, status: 200, headers: { 'content-type': [mediaType] }, body, encoded: body };
    },
  },
};
try {
  for (const test of cases) {
    httpCalls = 0;
    const corrupted = replace(test.artifact, ['data', ...test.path], test.value);
    const program = await prepareArtifact(corrupted, operations);
    await assert.rejects(
      program.run({ url: 'https://source.invalid/' }),
      { code: 'INVALID_VALUE' },
      test.name,
    );
    assert.equal(httpCalls, 0, test.name + ' reached HTTP');
  }
  console.log(
    `Artifact admission: ${cases.length} malformed data cases rejected before HTTP; HTTP calls 0.`,
  );
  for (const [artifact, type, text] of [
    [page, 'text/html', '<main><article><h2>Current</h2></article></main>'],
    [json, 'application/json', '{"label":"Current"}'],
    [xml, 'application/xml', '<items><item>Current</item></items>'],
  ] as const) {
    mediaType = type;
    source = text;
    httpCalls = 0;
    const program = await prepareArtifact(artifact, operations);
    const result = await program.run({ url: 'https://source.invalid/' });
    assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.equal(httpCalls, 1);
    assert(JSON.stringify(result.value).includes('Current'));
  }
  console.log(
    'Artifact admission: 3 unchanged valid HTML/JSON/XML controls executed; 3 fake HTTP calls, no models.',
  );
} finally {
  web.close();
}
