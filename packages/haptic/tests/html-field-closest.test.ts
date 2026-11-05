import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import {
  createHtmlStructure,
  readHtmlProfile,
  HtmlSelectorError,
} from '../src/readers/html/index.js';
import { createHtmlViewOperation } from '../src/discovery/html-view.js';
import { createHtmlMeasureOperation } from '../src/discovery/html-measure.js';
import { HtmlSourceCandidateSchema } from '../src/discovery/source-author.js';

const content = `<main class="group" data-id="outer"><h2>Outer</h2>
  <section class="group" data-id="a"><h2>Alpha</h2>
    <article class="row" data-id="1"><b>One</b><small>Note</small></article>
    <article class="row" data-id="2"><b>Two</b></article>
    <section class="group" data-id="inner"><article class="row" data-id="3"><b>Three</b></article></section>
  </section>
  <section class="group" data-id="b"><h2>Beta</h2><article class="row" data-id="4"><b>Four</b></article></section>
</main><article class="row" data-id="5"><b>Outside</b></article>`;
const source = (html: string) => {
  const body = captureBody(Buffer.from(html));
  return {
    url: 'https://fixture.invalid/groups',
    status: 200,
    headers: { 'content-type': ['text/html'] },
    encoded: body,
    body,
  };
};
const fields = {
  label: { selector: 'b', attribute: null, minimum: 1, maximum: 1 },
  group: {
    closest: '.group',
    selector: ':scope > h2',
    attribute: null,
    minimum: 0,
    maximum: 1,
  },
  identity: {
    closest: '.row',
    selector: ':scope',
    attribute: 'data-id',
    minimum: 1,
    maximum: 1,
  },
  notes: { selector: 'small', attribute: null, minimum: 0, maximum: null },
};
const resultSchema = z.object({
  items: z.array(z.object({ fields: z.record(z.string(), z.array(z.string().nullable())) })),
});
const context = { signal: new AbortController().signal };
const web = createWebOperations();
const select = web.operations['html.select'];
assert(select);
const read = async (html: string, rules: unknown = fields, selector = '.row') =>
  resultSchema
    .parse(
      await select.run({ source: source(html), selector, fields: z.json().parse(rules) }, context),
    )
    .items.map((item) => item.fields);

try {
  const original = source(content);
  const before = structuredClone(original);
  const expected = [
    { label: ['One'], group: ['Alpha'], identity: ['1'], notes: ['Note'] },
    { label: ['Two'], group: ['Alpha'], identity: ['2'], notes: [] },
    { label: ['Three'], group: [], identity: ['3'], notes: [] },
    { label: ['Four'], group: ['Beta'], identity: ['4'], notes: [] },
    { label: ['Outside'], group: [], identity: ['5'], notes: [] },
  ];
  assert.deepEqual(await read(content), expected);
  await select.run({ source: original, selector: '.row', fields }, context);
  assert.deepEqual(original, before);
  console.log(
    '[pass] closest fields: nearest groups, self matches, missing contexts and optional notes',
  );

  const structure = createHtmlStructure(content);
  const row = structure.query('.row')[0];
  assert(row);
  assert.equal(structure.closest(':scope', row), row);
  assert.equal(structure.closest('.group', row)?.attribs['data-id'], 'a');
  assert.equal(structure.closest('main .group', row)?.attribs['data-id'], 'a');
  assert.equal(structure.closest('.row + .row', row), null);
  assert.equal(structure.queryWithin('main h2', row).length, 0);
  assert.deepEqual(
    await read(content, { group: { ...fields.group, selector: ':scope + .group h2' } }),
    Array.from({ length: 5 }, () => ({ group: [] })),
  );
  console.log(
    '[pass] closest fields: scope identity, original-document matching and retained sibling isolation',
  );

  for (const closest of ['> section', '+ article']) {
    assert.throws(() => structure.closest(closest, row), HtmlSelectorError);
    for (const selector of ['.row', '.absent']) {
      const rules = { label: { ...fields.label, closest } };
      await assert.rejects(read(content, rules, selector), { code: 'HTML_SELECTOR' });
      const measured = z
        .object({ queries: z.array(z.object({ pages: z.array(z.object({ error: z.json() })) })) })
        .parse(
          await createHtmlMeasureOperation().run(
            {
              sources: [original],
              queries: [{ id: 'invalid-ancestor', selector, fields: rules, anchors: [] }],
              diagnostics: null,
              contextPolicy: null,
            },
            context,
          ),
        );
      assert.equal(
        z.object({ code: z.string() }).parse(measured.queries[0]?.pages[0]?.error).code,
        'HTML_SELECTOR',
      );
    }
  }
  assert.equal(structure.closest('.row:has(> b)', row), row);
  assert.deepEqual(
    await read(content, { label: { ...fields.label, selector: '> b' } }),
    expected.map(({ label }) => ({ label })),
  );
  console.log(
    '[pass] closest fields: relative ancestor selectors produce repair feedback even without records; relative descendant and nested :has selectors remain supported',
  );

  const missing = {
    group: { ...fields.group, closest: '.absent', minimum: 1 },
  };
  await assert.rejects(
    read(content, missing),
    /HTML_FIELD_MATCHES.*"actual":0.*"closest":".absent"/,
  );
  await assert.rejects(
    read(content, { group: { ...fields.group, minimum: 1 } }),
    /HTML_FIELD_MATCHES.*"recordIndex":2/,
  );
  await assert.rejects(
    read(content.replace('<h2>Alpha</h2>', '<h2>Alpha</h2><h2>Ambiguous</h2>')),
    /HTML_FIELD_MATCHES/,
  );
  for (const closest of ['', null, 12])
    await assert.rejects(read(content, { group: { ...fields.group, closest } }));
  await assert.rejects(
    read(content, { group: { ...fields.group, closest: 'section:hover' } }, '.absent'),
    /HTML_SELECTOR/,
  );
  await assert.rejects(
    read(content, { group: { ...fields.group, closest: '.group[' } }, '.absent'),
    /HTML_SELECTOR/,
  );
  console.log(
    '[pass] closest fields: no farther-group fallback, required/ambiguous matches and invalid rule rejection',
  );

  assert.deepEqual(
    await read(content, { label: fields.label, notes: fields.notes }),
    expected.map(({ label, notes }) => ({ label, notes })),
  );
  assert.deepEqual(await read(content.replaceAll('class="row"', 'class="other"')), []);
  const changed = content
    .replace('<h2>Alpha</h2>', '<h2>Changed</h2>')
    .replace('<b>Two</b>', '<b>Updated</b>');
  const added = changed.replace(
    '<h2>Beta</h2>',
    '<h2>Beta</h2><article class="row" data-id="new"><b>New</b><small>Own</small></article>',
  );
  const addedValues = await read(added);
  assert.deepEqual(addedValues[1], {
    label: ['Updated'],
    group: ['Changed'],
    identity: ['2'],
    notes: [],
  });
  assert.deepEqual(addedValues[3], {
    label: ['New'],
    group: ['Beta'],
    identity: ['new'],
    notes: ['Own'],
  });
  console.log(
    '[pass] closest fields: unchanged old rules, changed values, added records and empty selections',
  );

  const view = createHtmlViewOperation();
  const viewed = z.object({ items: z.array(z.object({ fields: z.json() })) }).parse(
    await view.run(
      {
        document: { url: original.url, sourceSha256: original.body.sha256, html: content },
        selector: '.row',
        fields,
        window: { offset: 0, limit: 10 },
        maxBytes: 65536,
      },
      context,
    ),
  );
  assert.deepEqual(
    viewed.items.map((item) => item.fields),
    expected,
  );
  const measure = createHtmlMeasureOperation();
  const measured = z
    .object({ queries: z.array(z.object({ pages: z.array(z.object({ error: z.json() })) })) })
    .parse(
      await measure.run(
        {
          sources: [original],
          queries: [{ id: 'group', selector: '.row', fields: missing, anchors: [] }],
          diagnostics: null,
          contextPolicy: null,
        },
        context,
      ),
    );
  assert.deepEqual(measured.queries[0]?.pages[0]?.error, {
    code: 'HTML_FIELD_MATCHES',
    field: 'group',
    selector: ':scope > h2',
    closest: '.absent',
    minimum: 1,
    maximum: 1,
    actual: 0,
    recordIndex: 0,
  });
  const reads = Object.fromEntries(
    Object.entries(fields).map(([name, rule]) => {
      const { minimum: _minimum, maximum: _maximum, ...read } = rule;
      return [name, read];
    }),
  );
  assert(
    HtmlSourceCandidateSchema.safeParse({
      selector: '.row',
      fields: reads,
      links: null,
      result: null,
    }).success,
  );
  assert(
    !HtmlSourceCandidateSchema.safeParse({ selector: '.row', fields, links: null, result: null })
      .success,
  );
  console.log(
    '[pass] closest fields: discovery offers read scopes; explicit runtime match bounds remain enforced',
  );

  const artifact = {
    stamp: { 'eden.engine': 1, 'nisc.prism': 2 },
    flow: {
      inputSchema: {},
      outputSchema: {},
      steps: [
        {
          id: 'records',
          call: { operation: 'html.select' },
          input: { source: { $ref: '$.input' }, selector: '.row', fields },
        },
      ],
      output: { $ref: '$.steps.records.value' },
    },
  };
  const prepared = await prepareArtifact(artifact, web.operations);
  const first = await prepared.run(original);
  assert.equal(first.status, 'completed');
  assert.deepEqual(
    resultSchema.parse(first.value).items.map((item) => item.fields),
    expected,
  );
  const second = await prepared.run(source(added));
  assert.equal(second.status, 'completed');
  assert.deepEqual(
    resultSchema.parse(second.value).items.map((item) => item.fields),
    addedValues,
  );
  const controller = new AbortController();
  const retained = createHtmlStructure(content, {}, controller.signal);
  const retainedRow = retained.query('.row')[0];
  assert(retainedRow);
  controller.abort();
  assert.throws(() => retained.closest('.group', retainedRow));
  const profile = readHtmlProfile();
  const constrained = createWebOperations({
    html: { ...profile, limits: { ...profile.limits, maxFieldValues: 1 } },
  });
  try {
    const operation = constrained.operations['html.select'];
    assert(operation);
    await assert.rejects(
      operation.run(
        { source: original, selector: '.row', fields: { group: fields.group } },
        context,
      ),
      /field-value allowance/,
    );
  } finally {
    constrained.close();
  }
  console.log(
    '[pass] closest fields: reusable mechanical execution, cancellation and existing shared allowances',
  );
} finally {
  web.close();
}
