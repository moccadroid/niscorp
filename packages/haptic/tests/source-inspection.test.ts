import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import type { JsonValue } from '../src/engine/contracts.js';
import { defineOperation } from '../src/engine/operation.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { capturedSources } from './helpers/captured-sources.js';
import { sourceJob, sourceJobInput } from './helpers/source-job.js';

const baseUrl = 'https://inspection.invalid/source';
const task = { requiresNavigation: false, resultFlow: null };
const ownedSource = (format: 'html' | 'json' | 'xml', value: JsonValue, url = baseUrl) => {
  const text = format === 'json' ? JSON.stringify(value) : z.string().parse(value);
  const body = captureBody(Buffer.from(text));
  return {
    format,
    document:
      format === 'json'
        ? { url, document: value }
        : format === 'xml'
          ? { url, xml: text, encoding: 'utf-8' }
          : { url, sha256: body.sha256, encoding: 'utf-8', html: text },
    source: {
      url,
      status: 200,
      headers: { 'content-type': [format === 'html' ? 'text/html' : 'application/' + format] },
      body,
      encoded: body,
    },
  };
};
const state = (owned: ReturnType<typeof ownedSource>[]) =>
  sourceJob({
    instruction: 'Inspect the already owned source values.',
    task,
    sources: owned.map((entry, index) => ({ ...entry, index })),
    level: {
      depth: 0,
      format: owned[0]?.format ?? null,
      frontier: owned.map((value) => value.source.url),
      sources: capturedSources(owned).identities,
      redirects: [],
      reference: false,
      standalone: false,
      trials: [],
      ready: false,
      rule: null,
    },
  });

const discovery = createDiscoveryOperations({ author: { apiKey: 'unused-offline' } });
let httpCalls = 0;
let nextSource: z.output<typeof HttpSourceSchema> | null = null;
const operations = { ...discovery.operations };
operations['http.get'] = defineOperation({
  input: z.object({ url: z.string() }).strict(),
  output: HttpSourceSchema,
  run(input) {
    httpCalls++;
    assert(nextSource, 'Inspection must never acquire a source');
    assert.equal(input.url, nextSource.url);
    return nextSource;
  },
});
for (const name of Object.keys(operations).filter(
  (name) =>
    name.startsWith('author.') ||
    ['task.declare', 'result.contract', 'result.review'].includes(name),
)) {
  operations[name] = defineOperation({
    input: z.json(),
    output: z.json(),
    run() {
      throw new Error('Source inspection cannot invoke a model: ' + name);
    },
  });
}
const helper = async (id: string) => {
  const entry = discoveryWorkflow.flows.find((entry) => entry.id === id);
  assert(entry);
  return prepareArtifact(
    {
      stamp: discoveryWorkflow.stamp,
      data: discoveryWorkflow.data,
      flow: entry.flow,
      flows: discoveryWorkflow.flows,
    },
    operations,
    discoveryProfile.engine,
  );
};
const inspected = await helper('inspect-source');
const inspect = async (
  owned: ReturnType<typeof ownedSource>[],
  query: JsonValue,
  window?: { offset: number; limit: number },
  index = 0,
) => {
  const input = {
    ...sourceJobInput('inspect-source', state(owned)),
    action: {
      action: 'inspect',
      source: index,
      query,
      window: window ?? { offset: 0, limit: 1 },
    },
  };
  const before = JSON.stringify(input);
  const outcome = await inspected.run(input);
  assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
  assert.equal(
    JSON.stringify(input),
    before,
    'Inspection must own its input and preserve original captures',
  );
  const result = z
    .object({
      feedback: z.object({
        failure: z.null(),
        inspection: z.object({ kind: z.literal('source-inspection'), result: z.json() }).loose(),
      }),
    })
    .loose()
    .parse(outcome.value);
  return {
    state: result,
    observation: result.feedback.inspection,
  };
};

try {
  for (const source of [
    ownedSource('json', { rows: [1, 2] }),
    ownedSource('xml', '<root><record>One</record></root>'),
  ]) {
    const result = await inspect([source], { selector: 'main' });
    assert.deepEqual(
      z.object({ error: z.string(), format: z.string() }).parse(result.observation.result),
      { error: 'SOURCE_QUERY_FORMAT', format: source.format },
    );
  }
  assert.equal(httpCalls, 0);
  console.log(
    '[pass] source inspection: HTML-shaped JSON/XML queries become format observations, with no model/HTTP effects',
  );

  const html = ownedSource('html', '<main><article><h2>Heading</h2></article></main>');
  for (const [query, code] of [[{ selector: '[' }, 'HTML_SELECTOR']] satisfies [
    JsonValue,
    string,
  ][]) {
    const result = await inspect([html], query);
    assert.deepEqual(
      z
        .object({ status: z.string(), error: z.object({ code: z.string() }) })
        .parse(result.observation.result),
      { status: 'failed', error: { code } },
    );
  }
  const absent = await inspect([html], {
    selector: 'article',
    fields: { missingValue: { selector: '.missing', attribute: null } },
  });
  assert.deepEqual(
    z
      .object({
        status: z.literal('completed'),
        value: z.object({
          items: z.array(z.object({ fields: z.object({ missingValue: z.array(z.null()) }) })),
        }),
      })
      .parse(absent.observation.result).value.items[0]?.fields.missingValue,
    [],
  );
  assert.equal(httpCalls, 0);
  console.log(
    '[pass] source inspection: malformed CSS remains an error; unavailable fields remain usable empty arrays',
  );
  const nested = await inspect(
    [ownedSource('html', '<article id="parent"><article id="child">Child</article></article>')],
    { selector: 'article', fields: { identity: { selector: ':scope', attribute: 'id' } } },
    { offset: 0, limit: 10 },
  );
  const nestedFields = z
    .object({
      status: z.literal('completed'),
      value: z.object({
        items: z.array(z.object({ fields: z.object({ identity: z.array(z.string()) }) })),
      }),
    })
    .parse(nested.observation.result);
  assert.deepEqual(
    nestedFields.value.items.map((item) => item.fields.identity),
    [['parent'], ['child']],
  );
  console.log(
    '[pass] source inspection: explicit nested field queries retain every displayed record association',
  );

  const xml = ownedSource(
    'xml',
    '<root><record>First</record><record>Second</record><record>Third</record></root>',
  );
  const xmlRule = { selector: '/root/record', namespaces: {}, fields: { label: 'string(.)' } };
  const preview = await inspect([xml], xmlRule, { offset: 1, limit: 1 });
  const xmlPreview = z
    .object({
      status: z.literal('completed'),
      total: z.number(),
      range: z.object({ offset: z.number(), end: z.number(), nextOffset: z.number().nullable() }),
      value: z.object({ items: z.array(z.object({ label: z.string() })) }),
    })
    .parse(preview.observation.result);
  assert.deepEqual(xmlPreview, {
    status: 'completed',
    total: 3,
    range: { offset: 1, end: 2, nextOffset: 2 },
    value: { items: [{ label: 'Second' }] },
  });
  const selectXml = discovery.operations['xml.select'];
  assert(selectXml);
  const complete = z
    .object({ items: z.array(z.object({ label: z.string() })) })
    .parse(
      await selectXml.run(
        { source: xml.source, rule: xmlRule },
        { signal: new AbortController().signal },
      ),
    );
  assert.deepEqual(complete.items, [{ label: 'First' }, { label: 'Second' }, { label: 'Third' }]);
  assert.equal(httpCalls, 0);
  console.log(
    '[pass] source inspection: XML windows bound displayed records while full original XPath extraction remains unchanged',
  );

  for (const value of [null, false, 0, '123', '"quoted"', 'null']) {
    const result = await inspect([ownedSource('json', value)], []);
    assert.equal(
      z.object({ error: z.string() }).parse(result.observation.result).error,
      'SOURCE_QUERY_FORMAT',
    );
  }
  const unknown = await inspect([html], { selector: 'main' }, undefined, 5);
  assert.deepEqual(unknown.observation.result, { error: 'SOURCE_NOT_OWNED' });
  assert.equal(httpCalls, 0);
  console.log(
    '[pass] source inspection: unavailable JSON inspection and unknown source indices never acquire',
  );

  const stable = state([html, ownedSource('json', { different: 'value' }, baseUrl + '/other')]);
  const stableOutcome = await inspected.run({
    ...sourceJobInput('inspect-source', {
      ...stable,
      sources: stable.sources.filter((entry) => entry.index === 1),
    }),
    action: {
      action: 'inspect',
      source: 0,
      query: { selector: 'h2' },
      window: { offset: 0, limit: 1 },
    },
  });
  assert.equal(stableOutcome.status, 'completed');
  const stableFeedback = z
    .object({ feedback: z.object({ inspection: z.object({ result: z.json() }) }) })
    .parse(stableOutcome.value).feedback.inspection;
  assert.deepEqual(stableFeedback.result, { error: 'SOURCE_NOT_OWNED' });
  assert.equal(httpCalls, 0);
  console.log(
    '[pass] source inspection: historical captures outside the current frontier are not source-authoring inputs',
  );

  const acquire = await helper('acquire-phase');
  for (const value of [null, false, 0, '123', '"quoted"', 'null']) {
    const source = ownedSource('json', value);
    nextSource = source.source;
    const initial = {
      acquisition: { sources: [], visited: [], seen: [], redirects: [] },
      owned: [],
      frontier: [baseUrl],
      processed: [],
      depth: 0,
      task,
      policy: discoveryProfile.traversal,
      formats: discoveryProfile.formats,
      htmlContext: discoveryProfile.htmlContext,
    };
    const outcome = await acquire.run(initial);
    assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
    const acquired = z
      .object({ owned: z.array(z.object({ document: z.object({ document: z.json() }) })) })
      .parse(outcome.value);
    assert.deepEqual(
      acquired.owned[0]?.document.document,
      value,
      'Native acquired JSON must preserve scalar identity, including string quotes',
    );
  }
  console.log(
    '[pass] source inspection: native acquisition preserves null, booleans, numbers and quoted JSON strings',
  );
} finally {
  discovery.close();
}
