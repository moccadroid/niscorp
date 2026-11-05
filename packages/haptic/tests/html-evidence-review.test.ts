import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';

const discovery = createDiscoveryOperations({ author: { apiKey: 'offline-only' } });
const review = discoveryWorkflow.flows.find((entry) => entry.id === 'result-review');
assert(review);
const requests: Array<{
  messages: Array<{ role: string; content: string }>;
  settings: { maxSteps: number };
}> = [];
let decisions: unknown[] = [];
let charges: number[] = [];
let http = 0;
const operations = { ...discovery.operations };
const model = operations['result.review'];
const get = operations['http.get'];
assert(model && get);
operations['http.get'] = {
  ...get,
  run() {
    http++;
    throw Error('Review cannot acquire URLs');
  },
};
operations['result.review'] = {
  ...model,
  async run(input) {
    const request = z
      .object({
        messages: z.array(z.object({ role: z.string(), content: z.string() })),
        settings: z.object({ maxSteps: z.number() }),
      })
      .parse(input);
    requests.push(request);
    const decision = decisions.shift();
    assert(decision !== undefined, 'Unexpected extra reviewer call');
    const steps = charges.shift() ?? 1;
    return {
      ok: true,
      decision: z.json().parse(decision),
      error: null,
      rawSources: [],
      meta: {
        steps,
        elapsedMs: steps,
        outputRetries: steps - 1,
        strategy: 'emit',
        usage: {
          inputTokens: 10 * steps,
          outputTokens: 2 * steps,
          totalTokens: 12 * steps,
          reported: true,
        },
      },
    };
  },
};
const inspect = (source = 0, selector = '.entry', offset = 0) => ({
  action: 'inspect',
  source,
  query: { selector, fields: null },
  window: { offset, limit: 1 },
});
const html =
  '<aside>' +
  'x'.repeat(20000) +
  '</aside><main><div class="entry"><a href="/one"></a><h2>One</h2><p>Description outside the anchor</p></div><div class="entry"><h2>Two</h2></div></main>';
const profile = {
  ...discoveryProfile,
  htmlContext: { ...discoveryProfile.htmlContext, maxInlineBytes: 4096 },
};
const input = {
  url: 'https://review-evidence.invalid/',
  instruction: 'Return entry headings, links and descriptions.',
  resultDataSchema: { type: 'array' },
  dataToReview: [{ arbitraryCaption: 'One', arbitraryDescription: null }],
  sourceEvidence: [{ format: 'html', url: 'https://review-evidence.invalid/', html }],
  context: {
    limits: discoveryProfile.traversal,
    resources: discoveryProfile.resources,
    visited: ['https://review-evidence.invalid/'],
    limited: false,
    resourceUrls: [],
    resourceRedirects: [],
  },
  profile,
  asOf: '2026-11-03T12:00:00+01:00',
};
const prepared = await prepareArtifact(
  { ...discoveryWorkflow, flow: review.flow },
  operations,
  discoveryProfile.engine,
);
const run = async (answers: unknown[]) => {
  decisions = structuredClone(answers);
  requests.length = 0;
  const outcome = await prepared.run(input);
  assert.equal(outcome.status, 'completed');
  return z
    .object({
      ok: z.boolean(),
      decision: z.json(),
      meta: z.object({ steps: z.number(), usage: z.object({ inputTokens: z.number() }) }),
      error: z.json().optional(),
    })
    .parse(outcome.value);
};
try {
  const rejection = {
    accepted: false,
    reason: 'Useful partial records; a source description was omitted.',
  };
  const result = await run([inspect(), rejection]);
  assert.deepEqual(result.decision, rejection);
  assert.equal(result.meta.steps, 2);
  assert.equal(result.meta.usage.inputTokens, 20);
  assert(
    requests.every((request) =>
      request.messages.some((message) => message.content === 'AS OF\n' + input.asOf),
    ),
  );
  assert(requests[0]?.messages.some((m) => m.content.includes('<h2>One</h2>')));
  assert(requests[0]?.messages.some((m) => m.content.includes('"completeDocument":false')));
  assert(requests[0]?.messages.some((m) => m.content.includes('byte-limit')));
  assert(!requests[0]?.messages.some((m) => m.content.includes('x'.repeat(10000))));
  assert(
    requests[1]?.messages.some((m) => m.content.includes('<p>Description outside the anchor</p>')),
  );
  assert(
    requests[1]?.messages.some(
      (m) => m.role === 'assistant' && m.content.includes('"action":"inspect"'),
    ),
  );
  assert(
    !requests[1]?.messages
      .filter((m) => m.content.startsWith('MECHANICAL REVIEW'))
      .some((m) => m.content.includes('<div')),
  );
  const second = requests[1];
  assert(second);
  assert.equal(
    second.messages
      .map((m) => m.content)
      .join('\n')
      .split('<p>Description outside the anchor</p>').length - 1,
    1,
  );
  console.log(
    '[pass] reviewer evidence: real HTML before the first call; explicit omissions; scoped HTML once; inspection history and negative verdict preserved',
  );

  const accepted = { accepted: true, reason: 'Controlled protocol verdict.' };
  assert.deepEqual((await run([inspect(99), inspect(), accepted])).decision, accepted);
  assert(requests[1]?.messages.some((m) => m.content.includes('SOURCE_NOT_OWNED')));
  assert.equal(http, 0);
  console.log(
    '[pass] reviewer evidence: outside indices return feedback without HTTP, then the same review can inspect and finish',
  );

  await run([inspect(0, '['), accepted]);
  assert(requests[1]?.messages.some((m) => m.content.includes('HTML_SELECTOR')));
  console.log(
    '[pass] reviewer evidence: invalid selectors return their mechanical failure without discarding the review',
  );

  const exhausted = await run(Array.from({ length: profile.settings.maxSteps }, () => inspect()));
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.decision, null);
  assert.equal(exhausted.meta.steps, profile.settings.maxSteps);
  assert.equal(requests.length, profile.settings.maxSteps);
  console.log(
    '[pass] reviewer evidence: all inspections charge the original allowance; exhaustion returns unavailable, not an inspection as verdict',
  );

  charges = [2, 1];
  const recovered = await run([inspect(), accepted]);
  assert.equal(recovered.meta.steps, 3);
  assert.equal(recovered.meta.usage.inputTokens, 30);
  assert.equal(requests[1]?.settings.maxSteps, 1);
  console.log(
    '[pass] reviewer evidence: Cortex recovery steps and tokens charge once and shrink the next call allowance',
  );

  const unavailable = await prepared.run({
    ...input,
    profile: { ...profile, htmlContext: { ...profile.htmlContext, maxInlineBytes: 1 } },
  });
  assert.equal(unavailable.status, 'completed');
  assert.equal(z.object({ ok: z.boolean() }).parse(unavailable.value).ok, false);

  const view = discoveryWorkflow.flows.find((flow) => flow.id === 'html-model-view');
  assert(view);
  const display = await prepareArtifact(
    { ...discoveryWorkflow, flow: view.flow },
    operations,
    discoveryProfile.engine,
  );
  const deep =
    '<title>' +
    't'.repeat(20000) +
    '</title><body>' +
    '<div>'.repeat(40) +
    '<p>READABLE RECORD</p>' +
    '<aside>' +
    'x'.repeat(20000) +
    '</aside>' +
    '</div>'.repeat(40) +
    '</body>';
  const visible = await display.run({
    source: 0,
    document: { url: input.url, html: deep },
    maxBytes: 16384,
    initial: profile.htmlContext.initialInspection,
    inspection: null,
  });
  assert.equal(visible.status, 'completed');
  assert(
    z
      .object({ usable: z.boolean(), html: z.string() })
      .parse(visible.value)
      .html.includes('READABLE RECORD'),
  );
  console.log(
    '[pass] evidence bootstrap: skipped oversized parents advance to readable later subtrees; impossible windows stay explicit',
  );

  const headHeavy =
    '<html><head>' +
    Array.from({ length: 80 }, (_, i) => `<meta name="entry-${i}" content="metadata">`).join('') +
    '</head><body><main><article><h2>BODY RECORD</h2><a href="/record">Record</a><p>Associated description</p></article></main><aside>' +
    'x'.repeat(20000) +
    '</aside></body></html>';
  const actual = await display.run({
    source: 0,
    document: { url: input.url, html: headHeavy },
    maxBytes: 16384,
    initial: profile.htmlContext.initialInspection,
    inspection: null,
  });
  assert.equal(actual.status, 'completed');
  const evidence = z
    .object({
      html: z.string(),
      metadata: z.object({
        completeDocument: z.boolean(),
        covered: z.number(),
        omitted: z.array(z.json()),
      }),
    })
    .parse(actual.value);
  assert(evidence.html.includes('<meta name="entry-0"'));
  assert(evidence.html.includes('<h2>BODY RECORD</h2>'));
  assert(evidence.html.includes('<p>Associated description</p>'));
  assert.equal(evidence.html.split('<h2>BODY RECORD</h2>').length - 1, 1);
  assert.equal(evidence.metadata.completeDocument, false);
  assert(evidence.metadata.covered > 0);
  assert(evidence.metadata.omitted.length > 0);
  console.log(
    '[pass] evidence coverage: a small head with more than 32 tags does not hide whole body records; metadata, omissions and no duplicate subtrees remain observable',
  );
  const siblings =
    Array.from({ length: 500 }, (_, i) => `<p>Article ${i}</p>`).join('') +
    '<aside>' +
    'x'.repeat(300000) +
    '</aside>';
  const many = await display.run({
    source: 0,
    document: { url: input.url, html: siblings },
    maxBytes: discoveryProfile.htmlContext.maxInlineBytes,
    initial: profile.htmlContext.initialInspection,
    inspection: null,
  });
  assert.equal(many.status, 'completed');
  const displayed = z.object({ html: z.string() }).parse(many.value).html;
  assert(displayed.includes('<p>Article 0</p>'));
  assert(displayed.includes('<p>Article 499</p>'));
  console.log(
    '[pass] evidence coverage: hundreds of sibling fragments render within the existing interpreter allowance without pairwise comparisons',
  );
} finally {
  discovery.close();
}
