import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import type { Operation } from '../src/engine/contracts.js';
import {
  createDiscoveryOperations,
  discoveryWorkflow,
  discoveryProfile,
} from '../src/discovery/index.js';
import { HtmlSourceInspectionSchema } from '../src/discovery/source-author.js';
import { captureBody } from '../src/operations/http-source.js';
import { capturedSources } from './helpers/captured-sources.js';
import { sourceJob, sourceJobInput } from './helpers/source-job.js';

const url = 'https://inspection-loop.invalid/records';
const markup =
  '<main><article><h2>One</h2><p>First description</p></article><article><h2>Two</h2></article><section>Outside the selected articles</section></main>';
const discovery = createDiscoveryOperations({ author: { apiKey: 'unused-offline' } });
let views = 0;
const view = discovery.operations['html.view'];
assert(view);
const operations: Record<string, Operation> = {
  ...discovery.operations,
  'html.view': {
    ...view,
    run(input, context) {
      views++;
      return view.run(input, context);
    },
  },
};
for (const name of Object.keys(operations)) {
  if (
    name.startsWith('author.') ||
    ['http.get', 'task.declare', 'result.contract', 'result.review'].includes(name)
  ) {
    const original = operations[name];
    assert(original);
    operations[name] = {
      ...original,
      run() {
        throw Error('No models or HTTP in inspection-loop checks');
      },
    };
  }
}
const source = (html: string, sourceUrl = url, index = 0) => {
  const body = captureBody(Buffer.from(html));
  return {
    index,
    format: 'html',
    source: {
      url: sourceUrl,
      status: 200,
      headers: { 'content-type': ['text/html'] },
      body,
      encoded: body,
    },
    document: { url: sourceUrl, sha256: body.sha256, encoding: 'utf-8', html },
  };
};
const state = (owned = [source(markup)]) =>
  sourceJob({
    instruction: 'Return titles and descriptions.',
    sources: owned,
    level: {
      depth: 0,
      format: 'html',
      frontier: owned.map((s) => s.source.url),
      sources: capturedSources(owned).identities,
      redirects: [],
      reference: false,
      standalone: false,
      trials: [],
      ready: false,
      rule: null,
    },
  });
const prepared = new Map<string, Awaited<ReturnType<typeof prepareArtifact>>>();
const runValue = async (id: string, input: unknown) => {
  let artifact = prepared.get(id);
  if (!artifact) {
    const flow = discoveryWorkflow.flows.find((f) => f.id === id);
    assert(flow);
    artifact = await prepareArtifact(
      { ...discoveryWorkflow, flow: flow.flow },
      operations,
      discoveryProfile.engine,
    );
    prepared.set(id, artifact);
  }
  const result = await artifact.run(sourceJobInput(id, input));
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return result.value;
};
const run = async (id: string, input: unknown) => {
  const result = z.record(z.string(), z.json()).parse(await runValue(id, input));
  return id === 'inspect-source' ? { ...sourceJobInput('build-source', input), ...result } : result;
};
const materialized = async (
  all: ReturnType<typeof source>[],
  current: ReturnType<typeof source>[],
) => {
  const captured = capturedSources(all);
  return runValue('level-sources', {
    level: state(current).level,
    owned: captured.owned,
    captures: captured.acquisition.sources,
  });
};
const action = (offset = 0, limit = 1) => ({
  action: 'inspect',
  source: 0,
  query: {
    selector: 'article',
    fields: { title: { selector: 'h2', attribute: null } },
  },
  window: { offset, limit },
});
const messages = (value: unknown) =>
  z.object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) }).parse(value)
    .messages;
const inspection = (value: unknown) =>
  z
    .object({
      feedback: z.object({
        inspection: z.object({ repeated: z.boolean(), result: z.json() }).loose(),
      }),
    })
    .parse(value).feedback.inspection;
try {
  assert(HtmlSourceInspectionSchema.safeParse(action()).success);
  for (const invalid of [
    { action: 'inspect', source: 0, query: { selector: 'article' } },
    {
      action: 'inspect',
      view: { kind: 'source', source: 0, query: { selector: 'article' } },
      window: { offset: 0, limit: 10 },
    },
    { ...action(), query: { selector: 'article', window: { offset: 0, limit: 10 } } },
    { ...action(), window: { offset: -1, limit: 0 } },
  ])
    assert(!HtmlSourceInspectionSchema.safeParse(invalid).success);
  console.log(
    '[pass] inspection loop: flat required windows; nested, missing and invalid ranges rejected',
  );

  const first = await run('inspect-source', { ...state(), action: action(0, 2) });
  assert.equal(views, 1);
  const remembered = {
    ...first,
    histories: await runValue('remember-author', {
      histories: first.histories ?? [],
      repairCount: first.repairCount ?? 0,
      repairFeedback: first.repairFeedback ?? null,
      feedback: await runValue('source-observation', { feedback: first.feedback ?? null }),
      model: { ok: true, decision: action(0, 2) },
      job: 'source',
      scope: { format: 'html', frontier: [url] },
      context: { component: 'initial' },
    }),
  };
  const offered = messages(await run('source-request', remembered));
  assert.equal(offered.filter((m) => m.role === 'assistant').length, 1);
  const evidence = offered.find((m) => m.content.startsWith('UNTRUSTED html SOURCE'));
  assert(evidence);
  assert(evidence.content.includes('<article>'));
  assert(!evidence.content.includes('Outside the selected articles'));
  const current = offered.find((m) => m.content.startsWith('CURRENT FEEDBACK'));
  assert(current);
  assert(!current.content.includes('<article>'));
  assert(evidence.content.includes('nextOffset'));
  assert(
    JSON.stringify(remembered).includes('First description') &&
      !JSON.stringify(remembered.histories).includes('<article>'),
  );
  assert.equal(
    offered
      .map((m) => m.content)
      .join('\n')
      .split('<h2>One</h2>').length - 1,
    1,
  );
  console.log(
    '[pass] inspection loop: own action retained; scoped HTML and current observation shown once',
  );

  const repeated = await run('inspect-source', { ...remembered, action: action(0, 2) });
  assert.equal(views, 1);
  assert.equal(inspection(repeated).repeated, true);
  const second = await run('inspect-source', { ...repeated, action: action(1, 1) });
  assert.equal(views, 2);
  assert.equal(inspection(second).repeated, false);
  await run('inspect-source', { ...second, action: action(0, 2) });
  assert.equal(views, 3);
  await run('inspect-source', {
    ...first,
    action: { ...action(0, 2), query: { selector: 'article' } },
  });
  assert.equal(views, 4);
  const changed = source(markup.replace('One', 'Changed'));
  const changedState = { ...first, ...state([changed]), feedback: first.feedback };
  await run('inspect-source', { ...changedState, action: action(0, 2) });
  assert.equal(views, 5);
  console.log(
    '[pass] inspection loop: exact consecutive reuse; different windows, fields and capture hashes execute normally',
  );

  const other = source('<main><h2>OTHER FRONTIER SOURCE</h2></main>', url + '/other', 1);
  const two = {
    ...first,
    ...state([source(markup), other]),
    feedback: first.feedback,
  };
  const offeredTwo = messages(await run('source-request', two));
  assert(
    offeredTwo.some(
      (m) =>
        m.content.includes('OTHER FRONTIER SOURCE') && !m.content.includes('SCOPED PREPARED HTML'),
    ),
  );
  const outside = { ...two, ...state([other]), feedback: two.feedback };
  assert(
    !messages(await run('source-request', outside)).some((m) => m.content.includes('<h2>One</h2>')),
  );
  console.log(
    '[pass] inspection loop: one source cannot replace or expose another frontier source',
  );

  const retained = source(markup, url, 1);
  const duplicate = {
    ...state([retained]),
    sources: await materialized([source(markup), retained], [retained]),
  };
  const duplicateMessages = messages(await run('source-request', duplicate));
  assert.equal(duplicateMessages.filter((m) => m.content.startsWith('UNTRUSTED')).length, 1);
  assert(duplicateMessages.some((m) => m.content.includes('SOURCE INDEX: 1')));
  const stale = await run('inspect-source', { ...duplicate, action: action() });
  assert.deepEqual(inspection(stale).result, { error: 'SOURCE_NOT_OWNED' });
  const replacement = source(markup.replace('One', 'CURRENT CAPTURE'), url, 2);
  const versions = {
    ...state([replacement]),
    sources: await materialized([source(markup), retained, replacement], [replacement]),
  };
  const versionMessages = messages(await run('source-request', versions));
  assert.equal(versionMessages.filter((m) => m.content.startsWith('UNTRUSTED')).length, 1);
  assert(versionMessages.some((m) => m.content.includes('CURRENT CAPTURE')));
  assert(!versionMessages.some((m) => m.content.includes('<h2>One</h2>')));
  console.log(
    '[pass] inspection loop: repair captures appear once; old versions and indices are not offered',
  );

  for (const selector of ['.absent', '[']) {
    const inspected = await run('inspect-source', {
      ...state(),
      action: { ...action(), query: { selector } },
    });
    const offered = messages(await run('source-request', inspected));
    assert(
      offered.some(
        (m) =>
          m.content.includes('Outside the selected articles') &&
          !m.content.includes('SCOPED PREPARED HTML'),
      ),
    );
  }
  const big = state([source('<main><article>' + 'large'.repeat(2000) + '</article></main>')]);
  const bounded = { ...big, observations: { ...discoveryProfile.observations, maxBytes: 1500 } };
  const omitted = await run('inspect-source', {
    ...bounded,
    action: { ...action(), query: { selector: 'article' } },
  });
  assert(JSON.stringify(inspection(omitted).result).includes('byte-limit'));
  assert(
    messages(await run('source-request', omitted)).some(
      (m) => m.content.includes('byte-limit') && m.content.includes('SCOPED PREPARED HTML'),
    ),
  );
  const disabled = {
    ...first,
    observations: { ...discoveryProfile.observations, useScopedHtml: false, skipRepeated: false },
  };
  assert(
    messages(await run('source-request', disabled)).some((m) =>
      m.content.includes('Outside the selected articles'),
    ),
  );
  const before = views;
  await run('inspect-source', { ...disabled, action: action(0, 2) });
  assert.equal(views, before + 1);
  console.log(
    '[pass] inspection loop: failed/empty/fully omitted views fall back; JSON flags disable scoping/reuse',
  );

  const abort = new AbortController();
  abort.abort();
  const inspector = prepared.get('inspect-source');
  assert(inspector);
  const beforeAbort = views;
  await assert.rejects(
    inspector.run(
      { ...sourceJobInput('inspect-source', state()), action: action() },
      { signal: abort.signal },
    ),
  );
  assert.equal(views, beforeAbort);
  const tiny = { ...state(), observations: { ...discoveryProfile.observations, maxBytes: 1 } };
  const unavailable = await run('inspect-source', { ...tiny, action: action() });
  assert.equal(
    z.object({ error: z.object({ code: z.string() }) }).parse(inspection(unavailable).result).error
      .code,
    'HTML_VIEW_OUTPUT_BYTES',
  );
  console.log(
    '[pass] inspection loop: cancellation precedes effects; observation bounds remain enforced',
  );

  const oversize = {
    ...state([source(markup + '<aside>' + 'x'.repeat(20000) + '</aside>')]),
    htmlContext: { ...discoveryProfile.htmlContext, maxInlineBytes: 4096 },
  };
  const manifest = await run('source-request', oversize);
  assert(messages(manifest).some((m) => m.content.includes('HTML VIEW METADATA')));
  assert(messages(manifest).some((m) => m.content.includes('<article>')));
  const inspectedOversize = await run('inspect-source', { ...oversize, action: action() });
  const scopedRequest = await run('source-request', inspectedOversize);
  assert(messages(scopedRequest).some((m) => m.content.includes('<h2>One</h2>')));
  assert(!messages(scopedRequest).some((m) => m.content.includes('<h2>Two</h2>')));
  const emptyOversize = await run('inspect-source', {
    ...oversize,
    action: { ...action(), query: { selector: '.missing', fields: null } },
  });
  assert(
    messages(await run('source-request', emptyOversize)).some((m) =>
      m.content.includes('HTML VIEW METADATA'),
    ),
  );
  console.log(
    '[pass] inspection loop: oversized HTML retains its full owned source, uses explicit bounded inspection, and never falls back to oversized bodies',
  );
} finally {
  discovery.close();
}
