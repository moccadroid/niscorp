import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import { ConfigSchema } from '@niscorp/prism';
import { mappingAgent } from '@niscorp/prism/agent';
import {
  HtmlSourceInspectionSchema,
  XmlSourceInspectionSchema,
  sourceAuthorSchema,
  createSourceAuthorOperations,
  HtmlSourceCandidateSchema,
  createTextBytesOperation,
} from '../src/discovery/source-author.js';
import { XmlSelectionSchema } from '../src/operations/xml.js';
import { createHtmlViewOperation, HtmlViewOutputSchema } from '../src/discovery/html-view.js';
import {
  createHtmlContextOperation,
  HtmlContextOutputSchema,
} from '../src/discovery/html-context.js';
import defaults from '../src/discovery/default-profile.json' with { type: 'json' };
import { readHtmlProfile } from '../src/readers/html/index.js';
import { prepareArtifact } from '../src/index.js';

const selection = sourceAuthorSchema(HtmlSourceCandidateSchema, HtmlSourceInspectionSchema);
assert(
  selection.safeParse({
    action: 'propose',
    candidate: { selector: 'article', fields: null, links: null, result: null },
  }).success,
);
assert(
  !HtmlSourceCandidateSchema.safeParse({
    preconditions: [],
    selector: 'article',
    links: null,
    result: null,
  }).success,
);
assert(
  !HtmlSourceInspectionSchema.safeParse({
    action: 'inspect',
    source: 0,
    query: {
      selector: 'article',
      fields: { name: { selector: 'h2', attribute: null, minimum: 1, maximum: 1 } },
    },
    window: { offset: 0, limit: 1 },
  }).success,
);
assert(
  !selection.safeParse({ action: 'propose', candidate: { preconditions: [], selector: 'h1' } })
    .success,
);
for (const value of [
  { action: 'finish', status: 'ready' },
  { action: 'finish', status: 'unresolved', reason: 'Unavailable' },
  { action: 'inspect', view: { kind: 'component', target: { part: 'schema' } } },
  { action: 'inspect', view: { kind: 'value', target: 'trialInput', path: [] } },
])
  assert(!selection.safeParse(value).success, JSON.stringify(value));
assert(
  sourceAuthorSchema(HtmlSourceCandidateSchema, HtmlSourceInspectionSchema).safeParse({
    action: 'propose',
    candidate: { selector: 'article', fields: null, links: null, result: null },
  }).success,
);
assert(HtmlSourceCandidateSchema.safeParse({ selector: 'a', links: null, result: null }).success);
assert(
  HtmlSourceCandidateSchema.safeParse({
    selector: 'a',
    links: null,
    result: { reference: ['attributes', 'href'] },
  }).success,
);
assert(
  !HtmlSourceCandidateSchema.safeParse({
    selector: 'a',
    links: null,
    result: { flow: { id: 'invented', revision: 1 }, input: { reference: ['attributes', 'href'] } },
  }).success,
);
const htmlInspection = {
  action: 'inspect',
  source: 0,
  query: { selector: 'main' },
  window: { offset: 0, limit: 3 },
};
const xmlInspection = {
  action: 'inspect',
  source: 1,
  query: { selector: '/a:item', namespaces: { a: 'urn:items' }, fields: { label: 'string(.)' } },
  window: { offset: 0, limit: 1 },
};
assert(HtmlSourceInspectionSchema.safeParse(htmlInspection).success);
assert(XmlSourceInspectionSchema.safeParse(xmlInspection).success);
assert(!HtmlSourceInspectionSchema.safeParse(xmlInspection).success);
assert(!XmlSourceInspectionSchema.safeParse(htmlInspection).success);
assert(
  !HtmlSourceInspectionSchema.safeParse({
    action: 'inspect',
    source: 0,
    url: 'https://unowned.invalid/',
    query: { selector: 'main' },
    window: { offset: 0, limit: 1 },
  }).success,
);
assert(
  !HtmlSourceInspectionSchema.safeParse({
    action: 'inspect',
    source: -1,
    query: { selector: 'main' },
    window: { offset: 0, limit: 1 },
  }).success,
);
assert(
  !XmlSourceInspectionSchema.safeParse({
    action: 'inspect',
    source: 0,
    query: ['records', 0],
    window: { offset: 0, limit: 1 },
  }).success,
);
assert.equal(
  await createTextBytesOperation().run('Grüße 👋', { signal: new AbortController().signal }),
  Buffer.byteLength('Grüße 👋'),
);
console.log(
  '[pass] source author: component candidates and format-specific source inspection only; retired finish/focus/value actions rejected',
);

const raw =
  '<main><script>secret</script><article><script>secret</script><h2>Grüße</h2><a onclick="secret()" href="/one">One</a></article><article><p>' +
  'large'.repeat(700) +
  '</p></article><article><h2>Three</h2></article></main>';
const prepared = HtmlContextOutputSchema.parse(
  await createHtmlContextOperation().run(
    {
      document: {
        url: 'https://example.invalid/list',
        sha256: createHash('sha256').update(raw).digest('hex'),
        encoding: 'utf-8',
        html: raw,
      },
      policy: defaults.htmlContext.policy,
    },
    { signal: new AbortController().signal },
  ),
);
const document = { url: prepared.url, sourceSha256: prepared.sourceSha256, html: prepared.html };
const view = createHtmlViewOperation();
const inspected = HtmlViewOutputSchema.parse(
  await view.run(
    { document, selector: 'article', window: { offset: 0, limit: 2 }, maxBytes: 1400 },
    { signal: new AbortController().signal },
  ),
);
assert.equal(inspected.total, 3);
assert.equal(inspected.range.nextOffset, 2);
assert.equal(inspected.items.length, 1);
assert.equal(inspected.items[0]?.index, 0);
assert(inspected.items[0]?.html.startsWith('<article>'));
assert(inspected.items[0]?.html.endsWith('</article>'));
assert(!JSON.stringify(inspected).includes('secret'));
assert.equal(inspected.omitted[0]?.index, 1);
assert.equal(inspected.omitted[0]?.reason, 'byte-limit');
assert(Buffer.byteLength(JSON.stringify(inspected)) <= 1400);
const large = {
  url: 'https://byte-budget.invalid/',
  html:
    '<main>' +
    '<i>x</i>'.repeat(10000) +
    '</main><aside>' +
    'x'.repeat(100000) +
    '</aside><section>' +
    'x'.repeat(100000) +
    '</section>',
};
for (const maxBytes of [80500, 80513, 80600]) {
  const bounded = HtmlViewOutputSchema.parse(
    await view.run(
      {
        document: large,
        selector: '*',
        window: { offset: 0, limit: 20000 },
        maxBytes,
        omitNested: true,
      },
      { signal: new AbortController().signal },
    ),
  );
  assert(Buffer.byteLength(JSON.stringify(bounded)) <= maxBytes);
  assert(bounded.covered > 0);
  if (bounded.range.nextOffset !== null) assert(bounded.range.nextOffset > bounded.range.offset);
}
const continued = HtmlViewOutputSchema.parse(
  await view.run(
    { document, selector: 'article', window: { offset: 2, limit: 2 }, maxBytes: 1400 },
    { signal: new AbortController().signal },
  ),
);
assert.equal(continued.range.nextOffset, null);
assert.equal(continued.items[0]?.index, 2);
assert(continued.items[0]?.html.includes('Three'));
await assert.rejects(
  view.run(
    { document, selector: 'article', window: { offset: 0, limit: 1 }, maxBytes: 1 },
    { signal: new AbortController().signal },
  ),
  { code: 'HTML_VIEW_OUTPUT_BYTES' },
);
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  view.run(
    { document, selector: 'article', window: { offset: 0, limit: 1 }, maxBytes: 1400 },
    { signal: aborted.signal },
  ),
);
assert.equal(raw.includes('secret'), true);
assert.equal(document.html, prepared.html);
const fieldView = HtmlViewOutputSchema.parse(
  await view.run(
    {
      document,
      selector: 'article',
      fields: {
        arbitraryLabel: { selector: 'h2', attribute: null, minimum: 1, maximum: 1 },
        clearedScript: { selector: 'script', attribute: null, minimum: 1, maximum: 1 },
        clearedHandler: { selector: 'a', attribute: 'onclick', minimum: 1, maximum: 1 },
      },
      window: { offset: 0, limit: 1 },
      maxBytes: 1400,
    },
    { signal: new AbortController().signal },
  ),
);
assert.deepEqual(fieldView.items[0]?.fields, {
  arbitraryLabel: ['Grüße'],
  clearedScript: [''],
  clearedHandler: [''],
});
assert(!JSON.stringify(fieldView).includes('secret'));
assert(Buffer.byteLength(JSON.stringify(fieldView)) <= 1400);
const htmlProfile = readHtmlProfile();
const fieldLimitedView = createHtmlViewOperation({
  html: { ...htmlProfile, limits: { ...htmlProfile.limits, maxFieldValues: 1 } },
});
await assert.rejects(
  fieldLimitedView.run(
    {
      document,
      selector: 'article',
      fields: {
        one: { selector: 'h2', attribute: null, minimum: 1, maximum: 1 },
        two: { selector: 'a', attribute: null, minimum: 1, maximum: 1 },
      },
      window: { offset: 0, limit: 1 },
      maxBytes: 1400,
    },
    { signal: new AbortController().signal },
  ),
  { code: 'HTML_FIELD_VALUES' },
);
const recordable = await prepareArtifact(
  {
    stamp: { 'eden.engine': 1, 'nisc.prism': 2 },
    data: { document },
    flow: {
      inputSchema: { type: 'object' },
      outputSchema: { type: 'array' },
      steps: [
        {
          id: 'views',
          call: { operation: 'html.view' },
          each: {
            items: [
              { selector: '[' },
              {
                selector: 'article',
                fields: {
                  required: { selector: '.absent', attribute: null, minimum: 1, maximum: 1 },
                },
              },
            ],
            onFailure: 'record',
          },
          input: {
            $merge: [
              {
                document: { $ref: '$.data.document' },
                window: { offset: 0, limit: 1 },
                maxBytes: 1400,
              },
              { $ref: '$.item' },
            ],
          },
        },
      ],
      output: { $ref: '$.steps.views.value' },
    },
  },
  { 'html.view': view },
);
const badViews = await recordable.run({});
assert.equal(badViews.status, 'completed');
const failures = z
  .array(z.object({ status: z.literal('failed'), error: z.object({ code: z.string() }) }))
  .parse(badViews.value);
assert.deepEqual(
  failures.map((failure) => failure.error.code),
  ['HTML_SELECTOR', 'HTML_FIELD_MATCHES'],
);
console.log(
  '[pass] author views: parser-aligned whole subtrees, explicit omissions/continuation and complete byte/cancellation bounds',
);

const prismDoc = mappingAgent.config.output?.doc;
assert.equal(typeof prismDoc, 'string');
const program = { $ref: '$.input' };
assert(ConfigSchema.safeParse(program).success);
assert(!ConfigSchema.safeParse({ $ref: 123 }).success);
const sourceCandidate = {
  action: 'propose',
  candidate: { selector: 'article', fields: null, links: null, result: null },
};
const xmlCandidate = {
  action: 'propose',
  candidate: { selector: '/root/entry', namespaces: {}, fields: { next: 'string(target)' } },
};
assert(
  sourceAuthorSchema(XmlSelectionSchema, XmlSourceInspectionSchema).safeParse(xmlCandidate).success,
);
assert(
  !sourceAuthorSchema(XmlSelectionSchema, XmlSourceInspectionSchema).safeParse({
    action: 'propose',
    candidate: { ...xmlCandidate.candidate, mapping: { links: [], resources: [] } },
  }).success,
);
const WireSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});
type WireMode =
  | 'output'
  | 'output-exhausted'
  | 'reference'
  | 'html'
  | 'html-inspection'
  | 'xml'
  | 'xml-proposal';
let mode: WireMode = 'output';
const captures: { mode: WireMode; wire: z.infer<typeof WireSchema> }[] = [];
const agentPaths: { mode: WireMode; path: string[] }[] = [];
const server = createServer(async (request, reply) => {
  let body = '';
  for await (const part of request) body += part;
  captures.push({ mode, wire: WireSchema.parse(JSON.parse(body)) });
  const count = captures.filter((capture) => capture.mode === mode).length;
  const data =
    mode === 'output' || mode === 'output-exhausted'
      ? count === 1 || mode === 'output-exhausted'
        ? { $ref: 123 }
        : program
      : mode === 'reference'
        ? { links: { $ref: '$.input.links' }, resources: [] }
        : mode === 'html-inspection'
          ? htmlInspection
          : mode === 'html'
            ? count === 1
              ? { action: 'finish', status: 'ready' }
              : sourceCandidate
            : mode === 'xml-proposal'
              ? count < 3
                ? { action: 'propose', candidate: { ...xmlCandidate.candidate, mapping: {} } }
                : xmlCandidate
              : count === 1
                ? htmlInspection
                : xmlInspection;
  reply.setHeader('content-type', 'text/event-stream');
  reply.end(
    'data: ' +
      JSON.stringify({
        id: 'source-author-offline',
        choices: [
          {
            index: 0,
            delta: {
              content:
                mode === 'xml-proposal' && count === 1 ? '{"data":' : JSON.stringify({ data }),
            },
            finish_reason: 'stop',
          },
        ],
      }) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
try {
  const client = createSignal(
    { adapter: 'openai-compatible', baseUrl: 'http://127.0.0.1:' + address.port + '/v1' },
    { apiKey: 'offline-only' },
  );
  const operations = createSourceAuthorOperations({
    client,
    record(event) {
      const parsed = z
        .object({ kind: z.literal('cortex'), value: z.object({ agentPath: z.array(z.string()) }) })
        .safeParse(event);
      if (parsed.success) agentPaths.push({ mode, path: parsed.data.value.agentPath });
    },
  });
  const request = {
    instructions: 'Return only the requested source component or program.',
    messages: [{ role: 'user', content: 'UNCHANGED REQUEST\nReturn requested values.' }],
    settings: defaults.settings,
    maxInputBytes: defaults.maxInputBytes,
  };
  for (const [current, name, expected] of [
    ['output', 'author.output', program],
    ['reference', 'author.reference', { links: { $ref: '$.input.links' }, resources: [] }],
    ['html', 'author.html', sourceCandidate],
    ['html-inspection', 'author.html', htmlInspection],
    ['xml', 'author.xml.selection', xmlInspection],
    ['xml-proposal', 'author.xml.selection', xmlCandidate],
  ] as const) {
    mode = current;
    const operation = operations[name];
    assert(operation);
    const outcome = await operation.run(
      {
        settings: request.settings,
        messages: request.messages,
        maxInputBytes: request.maxInputBytes,
        ...(current === 'output' || current === 'reference'
          ? {}
          : {
              instructions: request.instructions,
            }),
      },
      { signal: AbortSignal.timeout(30000) },
    );
    const result = z.object({ ok: z.boolean(), decision: z.json() }).parse(outcome);
    assert.equal(result.ok, true, JSON.stringify(outcome));
    assert.deepEqual(result.decision, expected);
    if (current === 'output' || current === 'reference') {
      const ownEvents = agentPaths.filter((event) => event.mode === current);
      assert(ownEvents.length > 0);
      assert(ownEvents.every((event) => event.path.includes(mappingAgent.agentId)));
    }
    const requests = captures.filter((capture) => capture.mode === current);
    assert.equal(
      requests.length,
      current === 'reference' || current === 'html-inspection'
        ? 1
        : current === 'xml-proposal'
          ? 3
          : 2,
      'Only Cortex schema recovery may add a response attempt',
    );
    for (const capture of requests) {
      assert(
        capture.wire.messages.some(
          (message) => message.content === 'UNCHANGED REQUEST\nReturn requested values.',
        ),
      );
      assert(
        capture.wire.messages.some((message) => message.content.startsWith('FINISH PROTOCOL:')),
      );
      const docs = capture.wire.messages.filter((message) =>
        message.content.startsWith('OUTPUT SCHEMA'),
      );
      assert.equal(docs.length, 1);
      if (current === 'output' || current === 'reference') {
        assert.equal(
          docs[0]?.content,
          prismDoc,
          'Mapping uses the published Prism documentation unchanged',
        );
        assert.equal(capture.wire.messages[0]?.content, mappingAgent.config.instructions);
        assert(!capture.wire.messages.some((message) => message.content === request.instructions));
        assert(!docs[0]?.content.includes('PRISM_CONFIG'));
        assert(!docs[0]?.content.includes('PROPOSAL FORM'));
      } else {
        const offered = docs[0]?.content;
        assert(offered);
        assert(offered.includes('"inspect"'));
        assert(offered.includes('"propose"'));
        assert(!offered.includes('"finish"'));
        assert(!offered.includes('"component"'));
        assert(!offered.includes('"trialInput"'));
        if (current === 'xml-proposal') {
          assert(offered.includes('"selector"'));
          assert(offered.includes('"namespaces"'));
          assert(!offered.includes('"mapping"'));
        }
      }
    }
  }
  const before = captures.length;
  const sourceOperation = operations['author.html'];
  assert(sourceOperation);
  await assert.rejects(
    sourceOperation.run(
      { ...request, unexpected: 'value' },
      { signal: AbortSignal.timeout(30000) },
    ),
    z.ZodError,
  );
  const output = operations['author.output'];
  assert(output);
  await assert.rejects(
    output.run(
      { ...request, documentation: { heading: 'Retired action grammar' } },
      { signal: AbortSignal.timeout(30000) },
    ),
  );
  assert.equal(
    captures.length,
    before,
    'Retired instruction/documentation overrides fail before a provider request',
  );
  mode = 'output-exhausted';
  const exhausted = await output.run(
    {
      messages: request.messages,
      settings: { ...request.settings, maxSteps: 2 },
      maxInputBytes: request.maxInputBytes,
    },
    { signal: AbortSignal.timeout(30000) },
  );
  assert.equal(z.object({ ok: z.boolean() }).parse(exhausted).ok, false);
  assert.equal(z.object({ meta: z.object({ steps: z.number() }) }).parse(exhausted).meta.steps, 2);
  assert.equal(captures.filter((capture) => capture.mode === 'output-exhausted').length, 2);
  assert(
    sourceAuthorSchema(XmlSelectionSchema, XmlSourceInspectionSchema).safeParse(xmlInspection)
      .success,
  );
  console.log(
    '[pass] published Prism: exact owner prompt/doc, agent identity, Cortex recovery and configured attempt cap; retired overrides rejected',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
