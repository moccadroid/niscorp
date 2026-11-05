import assert from 'node:assert/strict';
import { evaluateSafe } from '@niscorp/prism';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { discoveryWorkflow, discoveryProfile } from '../src/discovery/index.js';
import { createJsonEncodingOperation } from '../src/discovery/review.js';

const helper = discoveryWorkflow.flows?.find((flow) => flow.id === 'program-context');
assert(helper);
let encodings = 0;
const encoding = createJsonEncodingOperation(discoveryProfile.engine.maxJsonDepth);
const prepare = (flow: unknown) =>
  prepareArtifact(flow, {
    'json.encode': {
      ...encoding,
      run(input, context) {
        encodings++;
        return encoding.run(input, context);
      },
    },
  });
const prepared = await prepare({
  stamp: discoveryWorkflow.stamp,
  flows: [helper],
  flow: {
    inputSchema: {},
    outputSchema: {},
    steps: [
      {
        id: 'context',
        call: { flow: { id: helper.id, revision: helper.revision } },
        input: { $ref: '$.input' },
      },
    ],
    output: { $ref: '$.steps.context.value' },
  },
});
const values = [
  null,
  false,
  0,
  'a scalar',
  [1, 'two'],
  { input: { $ref: '$.secrets' }, pages: [{ label: 'One' }] },
];
const result = await prepared.run({ values });
assert.equal(result.status, 'completed');
const message = z
  .object({ role: z.literal('user'), content: z.string() })
  .strict()
  .parse(result.value);
assert(message.content.startsWith('EXAMPLE PROGRAM CONTEXTS'));
const scopes = z
  .array(z.object({ input: z.json() }).strict())
  .parse(JSON.parse(message.content.slice(message.content.indexOf('\n') + 1)));
assert.deepEqual(
  scopes.map((scope) => scope.input),
  values,
);
for (const [index, value] of values.entries()) {
  const program = { $ref: '$.input' };
  const actual = await (
    await prepareArtifact(
      {
        stamp: discoveryWorkflow.stamp,
        flow: { inputSchema: {}, outputSchema: {}, steps: [], output: program },
      },
      {},
    )
  ).run(value);
  assert.equal(actual.status, 'completed');
  const displayed = evaluateSafe(program, scopes[index]);
  assert(displayed.ok);
  assert.deepEqual(
    displayed.data,
    actual.value,
    'Displayed context must match actual engine execution',
  );
}
console.log(
  '[pass] program context: actual engine scope agrees for scalars, arrays and opaque nested source objects',
);

const before = encodings;
await assert.rejects(prepared.run({ values: [] }), { code: 'INVALID_VALUE' });
assert.equal(encodings, before);
console.log('[pass] program context: missing examples fail before effects');

const htmlSource = discoveryWorkflow.flows.find((flow) => flow.id === 'output-source');
assert(htmlSource);
const flatten = await prepareArtifact(
  { ...discoveryWorkflow, flows: [htmlSource], flow: htmlSource.flow },
  {},
);
const first = {
  text: 'One',
  attributes: { href: '/one' },
  path: [1],
  fields: { label: ['One'], note: [null] },
};
const second = { text: 'One', attributes: {}, path: [2], fields: { label: [], note: [] } };
const input = {
  pages: [
    {
      url: 'https://one.invalid/page',
      baseUrl: 'https://one.invalid/base/',
      encoding: 'utf-8',
      items: [first],
    },
    {
      url: 'https://two.invalid/page',
      baseUrl: 'https://two.invalid/',
      encoding: 'windows-1252',
      items: [second],
    },
  ],
  visited: ['https://one.invalid/page', 'https://two.invalid/page'],
  limited: true,
  redirects: [],
};
const saved = structuredClone(input);
const flat = await flatten.run(input);
assert.equal(flat.status, 'completed');
const shaped = z
  .object({ data: z.object({ records: z.array(z.json()) }).passthrough(), meta: z.json() })
  .parse(flat.value);
assert.deepEqual(shaped.data.records, [
  { ...first, sourceUrl: input.pages[0]?.url, baseUrl: input.pages[0]?.baseUrl, encoding: 'utf-8' },
  {
    ...second,
    sourceUrl: input.pages[1]?.url,
    baseUrl: input.pages[1]?.baseUrl,
    encoding: 'windows-1252',
  },
]);
assert(!Object.hasOwn(shaped.data, 'pages'));
assert.deepEqual(input, saved);
const shown = await prepared.run({ values: [shaped.data] });
assert.equal(shown.status, 'completed');
const rendered = z.object({ content: z.string() }).parse(shown.value).content;
const shownInput = z
  .array(z.object({ input: z.json() }))
  .parse(JSON.parse(rendered.slice(rendered.indexOf('\n') + 1)))[0]?.input;
assert.deepEqual(shownInput, shaped.data);
const empty = await flatten.run({ ...input, pages: [] });
assert.equal(empty.status, 'completed');
assert.deepEqual(
  z.object({ data: z.object({ records: z.array(z.json()) }) }).parse(empty.value).data.records,
  [],
);
const reference = { reference: 'https://one.invalid/file.pdf' };
const references = await flatten.run({
  ...input,
  pages: [{ ...input.pages[0], items: [reference] }, input.pages[1]],
});
assert.equal(references.status, 'completed');
assert.deepEqual(
  z.object({ data: z.object({ records: z.array(z.json()) }) }).parse(references.value).data.records,
  [
    {
      ...reference,
      sourceUrl: input.pages[0]?.url,
      baseUrl: input.pages[0]?.baseUrl,
      encoding: 'utf-8',
    },
    shaped.data.records[1],
  ],
);
for (const malformed of [
  { reference: 1 },
  { reference: '/file.pdf', invented: true },
  { text: 'incomplete HTML item' },
]) {
  await assert.rejects(
    flatten.run({ ...input, pages: [{ ...input.pages[0], items: [malformed] }] }),
    { code: 'INVALID_VALUE' },
  );
}
console.log(
  '[pass] traversal writer input: strict HTML/reference records retain provenance, duplicate values, null/empty fields, order and exact displayed execution scope',
);
