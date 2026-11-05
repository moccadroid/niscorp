import assert from 'node:assert/strict';
import { z } from 'zod';
import { load } from 'cheerio';
import { createWebOperations } from '../src/operations/index.js';
import {
  createHtmlAttributeClearing,
  HtmlContextPolicySchema,
} from '../src/discovery/html-context.js';
import { discoveryProfile } from '../src/discovery/index.js';
import { captureBody } from '../src/operations/http-source.js';
import { checkHtmlCandidate } from './helpers/discovery-policy.js';
import { HtmlAuthorOutputSchema } from '../src/discovery/index.js';
import { createHtmlSelectionInspector } from '../src/discovery/html-matches.js';
import {
  createHtmlMeasureOperation,
  HtmlMeasureOutputSchema,
} from '../src/discovery/html-measure.js';

const html =
  '<section><header><div><h2 id="entries">Entries</h2></div></header><ul class="records"><li data-record="one"><a class="photo" href="/one" onclick="payload()"><img src="/image"></a><div><a class="content" href="/one"><h3>Title</h3></a><a class="note" href="/one">Registration text</a></div></li></ul><script>script-secret</script></section>';
const body = captureBody(Buffer.from(html));
const source = {
  url: 'https://fixture.invalid/records',
  status: 200,
  headers: {},
  encoded: body,
  body,
};
const sourceBefore = JSON.stringify(source);
const signal = new AbortController().signal;
const policy = discoveryProfile.diagnostics;
assert(policy);
const validate = (
  rules: Partial<z.input<typeof HtmlAuthorOutputSchema>>,
  authoring: typeof discoveryProfile.authoring,
  minimumResultMatches: number,
) =>
  checkHtmlCandidate({
    sources: [source],
    rules: HtmlAuthorOutputSchema.parse({ preconditions: [], result: null, ...rules }),
    authoring,
    minimumResultMatches,
    signal,
  });
const preconditions = [{ selector: 'div:has(> h2#entries)', minimum: 1, maximum: null }];
const missing = await validate(
  { preconditions, selector: 'div:has(> h2#entries) + ul', links: null },
  discoveryProfile.authoring,
  0,
);
assert(!missing.accepted);
const diagnostic = z
  .object({
    pages: z.array(
      z.object({
        diagnostics: z.object({
          representation: z.string(),
          nodes: z.array(z.object({ ancestors: z.array(z.object({ html: z.string() })) })),
        }),
      }),
    ),
  })
  .parse(missing.feedback).pages[0]?.diagnostics;
assert(diagnostic);
assert(
  diagnostic.nodes[0]?.ancestors.some(
    (parent: { html: string }) =>
      parent.html.includes('<header>') && parent.html.includes('<ul class="records">'),
  ),
);
assert(Buffer.byteLength(JSON.stringify(diagnostic)) <= policy.maxBytes);

const fields = { caption: { selector: 'h3', attribute: null, minimum: 1, maximum: 1 } };
const wrongRecord = await validate(
  { preconditions, selector: 'li a', links: null, fields },
  discoveryProfile.authoring,
  0,
);
assert(!wrongRecord.accepted);
const failure = z
  .object({
    error: z.string(),
    recordIndex: z.number(),
    field: z.string(),
    actual: z.number(),
    diagnostics: z.object({
      nodes: z.array(
        z.object({ html: z.string(), ancestors: z.array(z.object({ html: z.string() })) }),
      ),
    }),
  })
  .parse(wrongRecord.feedback);
assert.equal(failure.error, 'HTML_FIELD_MATCHES');
assert.equal(failure.recordIndex, 0);
assert.equal(failure.field, 'caption');
assert.equal(failure.actual, 0);
assert(failure.diagnostics.nodes[0]?.html.includes('<img>'));
assert(!failure.diagnostics.nodes[0]?.html.includes('onclick'));
assert(!failure.diagnostics.nodes[0]?.html.includes('payload()'));
assert(
  failure.diagnostics.nodes[0]?.ancestors.some((parent: { html: string }) =>
    parent.html.includes('data-record="one"'),
  ),
);
assert(
  (
    await validate(
      { selector: 'li[data-record]', links: null, fields },
      discoveryProfile.authoring,
      0,
    )
  ).accepted,
);

const inspector = createHtmlSelectionInspector(source, discoveryProfile.diagnostics, signal);
const text = inspector.diagnose({ selector: 'a.note', recordIndex: 0, anchors: [] });
assert(text);
assert(
  load(text.nodes[0]?.html ?? '')
    .text()
    .includes('…'),
);
assert(!text.nodes[0]?.html.includes('Registration text'));
assert.equal(text.truncated, false);
assert.equal(inspector.select('a').total, 3);
const web = createWebOperations();
try {
  const select = web.operations['html.select'];
  assert(select);
  const selected = z
    .object({ items: z.array(z.object({ text: z.string() })) })
    .parse(await select.run({ source, selector: 'a.note' }, { signal }));
  assert.equal(selected.items[0]?.text, 'Registration text');
} finally {
  web.close();
}
assert(!JSON.stringify(text).includes('script-secret'));

const tiny = createHtmlSelectionInspector(source, { ...policy, maxBytes: 120 }, signal).diagnose({
  selector: 'a.note',
  recordIndex: 0,
  anchors: [],
});
assert(tiny?.truncated);
assert(Buffer.byteLength(JSON.stringify(tiny)) <= 120);
const none = createHtmlSelectionInspector(source, { ...policy, maxNodes: 0 }, signal).diagnose({
  selector: 'a.note',
  recordIndex: 0,
  anchors: [],
});
assert(none?.truncated);
assert.equal(none.nodes.length, 0);
assert.equal(
  createHtmlSelectionInspector(source, null, signal).diagnose({
    selector: 'a.note',
    recordIndex: 0,
    anchors: [],
  }),
  undefined,
);
assert.equal(JSON.stringify(source), sourceBefore);
const cancelled = new AbortController();
const cancelledInspector = createHtmlSelectionInspector(
  source,
  discoveryProfile.diagnostics,
  cancelled.signal,
);
cancelled.abort(new Error('diagnostic-cancelled'));
assert.throws(
  () => cancelledInspector.diagnose({ selector: 'a.note', recordIndex: 0, anchors: [] }),
  /diagnostic-cancelled/,
);
assert.throws(
  () => cancelledInspector.diagnose({ selector: null, anchors: [] }),
  /diagnostic-cancelled/,
);
const dangerousBody = captureBody(
  Buffer.from('<a href="javascript:payload()" data-action="javascript:also-payload()">Text</a>'),
);
const dangerousSource = { ...source, body: dangerousBody, encoded: dangerousBody };
const clearing = createHtmlAttributeClearing(
  HtmlContextPolicySchema.parse(discoveryProfile.htmlContext.policy),
);
const masked = createHtmlSelectionInspector(
  dangerousSource,
  discoveryProfile.diagnostics,
  signal,
  undefined,
  clearing,
).diagnose({ selector: 'a', recordIndex: 0, anchors: [] });
assert(!JSON.stringify(masked).includes('payload()'));
const maskedElement = load(masked?.nodes[0]?.html ?? '')('a');
assert.equal(maskedElement.attr('href'), '');
assert.equal(maskedElement.attr('data-action'), '');
console.log(
  '[pass] repair diagnostics: real parent/sibling structure, failing record identity, text elision, source immutability, JSON bounds, bypass and cancellation',
);

const measurementSources = [
  '<main><p><span>A</span></p></main>',
  '<main><p>B</p><p>C</p></main>',
].map((markup, index) => {
  const captured = captureBody(Buffer.from(markup));
  return { ...source, url: 'https://fixture.invalid/' + index, body: captured, encoded: captured };
});
const measurementBefore = JSON.stringify(measurementSources);
const measurement = HtmlMeasureOutputSchema.parse(
  await createHtmlMeasureOperation().run(
    {
      sources: measurementSources,
      queries: [
        { id: 'opaque:alpha', selector: 'p', anchors: [] },
        { id: 'opaque:beta', selector: 'span', anchors: [] },
        { id: 'opaque:empty', selector: '.absent', anchors: [] },
        {
          id: 'opaque:partial',
          selector: 'p',
          fields: { caption: { selector: 'span', attribute: null, minimum: 1, maximum: 1 } },
          anchors: [],
        },
      ],
      diagnostics: discoveryProfile.diagnostics,
      contextPolicy: discoveryProfile.htmlContext.policy,
    },
    { signal },
  ),
);
assert.deepEqual(
  measurement.queries.map(({ id, total }) => ({ id, total })),
  [
    { id: 'opaque:alpha', total: 3 },
    { id: 'opaque:beta', total: 1 },
    { id: 'opaque:empty', total: 0 },
    { id: 'opaque:partial', total: null },
  ],
);
assert.deepEqual(
  measurement.queries[0]?.pages.map((page) => page.report?.total),
  [1, 2],
);
const partial = measurement.queries[3];
assert(partial);
assert.equal(partial.pages[0]?.report?.total, 1);
assert.equal(partial.pages[1]?.report, null);
assert.equal(partial.pages[1]?.error?.code, 'HTML_FIELD_MATCHES');
assert.equal(JSON.stringify(measurementSources), measurementBefore);
const boundedMeasurement = HtmlMeasureOutputSchema.parse(
  await createHtmlMeasureOperation().run(
    {
      sources: measurementSources,
      queries: [{ id: 'opaque:bounded', selector: 'p', anchors: [] }],
      diagnostics: null,
      contextPolicy: null,
    },
    { signal },
  ),
);
assert.equal(boundedMeasurement.queries[0]?.total, 3);
assert(
  boundedMeasurement.queries[0]?.pages.every(
    (page) => page.report !== null && page.report.overlap === null,
  ),
);
console.log(
  '[pass] measurement facts: arbitrary query IDs, exact cross-source counts, valid empty counts, unknown aggregate after partial failure and unchanged sources',
);
