import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import { discoveryProfile, discoveryWorkflow } from '../src/discovery/index.js';
import { blueprint } from '../src/discovery/blueprint.js';
import { HtmlReferenceRecordSchema } from '../src/discovery/references.schema.js';

const web = createWebOperations();
let acquisitions = 0;
const get = web.operations['http.get'];
assert(get);
const operations = {
  ...web.operations,
  'http.get': {
    ...get,
    run() {
      acquisitions++;
      throw Error('Reference projection cannot acquire URLs');
    },
  },
};
const runHelper = async (
  id: string,
  input: unknown,
  data: unknown = { formats: discoveryProfile.formats },
) => {
  const flow = blueprint.flows.find((f) => f.id === id);
  assert(flow);
  const prepared = await prepareArtifact(
    { stamp: discoveryWorkflow.stamp, flows: blueprint.flows, data, flow: flow.flow },
    operations,
    discoveryProfile.engine,
  );
  const result = await prepared.run(input);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return result.value;
};

try {
  const record = {
    text: 'Original text',
    path: [0],
    attributes: { href: '/root#fragment', title: 'Original title' },
    fields: {
      arbitrary: ['/section/item', '../next', 'https://other.invalid/file', null, 'http://['],
      untouched: ['not a URL'],
    },
  };
  const saved = structuredClone(record);
  const fields = {
    arbitrary: { selector: 'a', attribute: 'href', minimum: 0, maximum: null },
    untouched: { selector: 'span', attribute: null, minimum: 0, maximum: null },
  };
  const result = HtmlReferenceRecordSchema.parse(
    await runHelper('html-references', {
      record,
      fields,
      urlAttributes: ['href'],
      base: 'https://example.invalid/europe',
      encoding: 'utf-8',
    }),
  );
  assert.deepEqual(result.fields, saved.fields);
  assert.deepEqual(result.attributes, saved.attributes);
  assert.deepEqual(record, saved);
  assert.deepEqual(result.references.attributes, { href: 'https://example.invalid/root#fragment' });
  assert.deepEqual(result.references.fields, {
    arbitrary: [
      'https://example.invalid/section/item',
      'https://example.invalid/next',
      'https://other.invalid/file',
      null,
      null,
    ],
  });
  assert.equal(result.referenceErrors[0]?.name, 'arbitrary');
  assert.equal(result.referenceErrors[0]?.errors[4]?.code, 'URL_INVALID');
  assert(result.referenceErrors[0]?.errors.slice(0, 4).every((error) => error === null));

  const changed = HtmlReferenceRecordSchema.parse(
    await runHelper('html-references', {
      record: {
        ...record,
        fields: { ...record.fields, arbitrary: ['item', 'item', '?page=2', '#anchor'] },
      },
      fields,
      urlAttributes: ['href'],
      base: 'https://example.invalid/files/',
      encoding: 'utf-8',
    }),
  );
  assert.deepEqual(changed.references.fields.arbitrary, [
    'https://example.invalid/files/item',
    'https://example.invalid/files/item',
    'https://example.invalid/files/?page=2',
    'https://example.invalid/files/#anchor',
  ]);
  const disabled = HtmlReferenceRecordSchema.parse(
    await runHelper('html-references', {
      record,
      fields,
      urlAttributes: [],
      base: 'https://example.invalid/europe',
      encoding: 'utf-8',
    }),
  );
  assert.deepEqual(disabled.references, { attributes: {}, fields: {} });
  assert.equal(acquisitions, 0);
  console.log(
    '[pass] reference projection: dynamic aliases, root/directory/absolute URLs, fragments, queries, duplicates, nulls, explicit failures and original values; no acquisition',
  );

  const html =
    '<base href="/files/"><main><article><a href="item">First</a></article><article><a href="/other">Second</a></article></main>';
  const body = captureBody(Buffer.from(html));
  const source = {
    url: 'https://example.invalid/europe',
    status: 200,
    headers: { 'content-type': ['text/html'] },
    body,
    encoded: body,
  };
  const rule = {
    preconditions: [],
    selector: 'article',
    links: null,
    result: null,
    fields: { dynamicReference: { selector: 'a', attribute: 'href', minimum: 0, maximum: null } },
  };
  const selected = z
    .object({
      selection: z.object({
        items: z.array(HtmlReferenceRecordSchema),
        baseUrl: z.string(),
        encoding: z.string(),
      }),
    })
    .parse(
      await runHelper('select', {
        source,
        rule,
        policy: discoveryProfile.traversal,
        canFollow: false,
        minimumResultMatches: 0,
      }),
    );
  assert.equal(selected.selection.baseUrl, 'https://example.invalid/files/');
  assert.deepEqual(
    selected.selection.items.map((item) => item.fields?.dynamicReference),
    [['item'], ['/other']],
  );
  assert.deepEqual(
    selected.selection.items.map((item) => item.references.fields.dynamicReference),
    [['https://example.invalid/files/item'], ['https://example.invalid/other']],
  );
  const projected = z
    .object({
      data: z.object({
        records: z.array(
          HtmlReferenceRecordSchema.extend({
            sourceUrl: z.string(),
            baseUrl: z.string(),
            encoding: z.string(),
          }),
        ),
      }),
    })
    .parse(
      await runHelper('output-source', {
        pages: [{ url: source.url, ...selected.selection }],
        visited: [source.url],
        limited: false,
        redirects: [],
      }),
    );
  assert.deepEqual(
    projected.data.records.map((item) => item.references),
    selected.selection.items.map((item) => item.references),
  );
  const emptyBody = captureBody(Buffer.from('<main></main>'));
  const empty = z.object({ selection: z.object({ items: z.array(z.json()) }) }).parse(
    await runHelper('select', {
      source: { ...source, body: emptyBody, encoded: emptyBody },
      rule,
      policy: discoveryProfile.traversal,
      canFollow: false,
      minimumResultMatches: 0,
    }),
  );
  assert.deepEqual(empty.selection.items, []);
  assert.equal(acquisitions, 0);
  console.log(
    '[pass] reference projection: actual reader base and whole shared output handoff agree; learned selection can execute on empty data without AI',
  );
} finally {
  web.close();
}
