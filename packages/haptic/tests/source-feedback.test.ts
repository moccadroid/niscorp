import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { createTrialOperation } from '../src/discovery/trial.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import type { Operation } from '../src/engine/contracts.js';
import { sourceJob, sourceJobInput } from './helpers/source-job.js';

const url = 'https://feedback.invalid/source';
const html = '<main><article><h2>Current label</h2></article></main>';
const body = captureBody(Buffer.from(html));
const source = {
  url,
  status: 200,
  headers: { 'content-type': ['text/html'] },
  body,
  encoded: body,
};
const discovery = createDiscoveryOperations({ author: { apiKey: 'offline-unused' } });
const web = createWebOperations();
let effects = 0;
const forbidden = () => {
  effects++;
  throw new Error('Feedback helpers cannot call HTTP or models');
};
const http = web.operations['http.get'];
assert(http);
const mechanical = {
  ...web.operations,
  'http.get': { ...http, run: forbidden },
};
const operations: Record<string, Operation> = {
  ...discovery.operations,
  ...mechanical,
  'artifact.trial': createTrialOperation(mechanical, discoveryProfile.trial),
};
for (const name of Object.keys(operations)) {
  if (
    name.startsWith('author.') ||
    ['task.declare', 'result.contract', 'result.review'].includes(name)
  ) {
    const original = operations[name];
    assert(original);
    operations[name] = { ...original, run: forbidden };
  }
}
const initial = sourceJob({
  instruction: 'Return all record labels.',
  schema: { type: 'array', items: { type: 'string' } },
  level: {
    depth: 0,
    format: 'html',
    frontier: [url],
    redirects: [],
    trials: [],
    ready: false,
    standalone: false,
    reference: false,
    sources: [{ url, sha256: body.sha256 }],
    rule: { preconditions: [], selector: 'article', links: null, fields: null, result: null },
  },
  sources: [
    {
      index: 0,
      format: 'html',
      source,
      document: { url, sha256: body.sha256, encoding: 'utf-8', html },
    },
  ],
  allowance: { steps: 7, ms: 20000 },
});
const stateSchema = z
  .object({
    feedback: z.object({ failure: z.json(), inspection: z.json() }).strict(),
    part: z.string(),
    allowance: z.json(),
  })
  .loose();
const helpers = new Map<string, Awaited<ReturnType<typeof prepareArtifact>>>();
const run = async (id: string, input: unknown) => {
  let prepared = helpers.get(id);
  if (!prepared) {
    const entry = discoveryWorkflow.flows.find((flow) => flow.id === id);
    assert(entry);
    prepared = await prepareArtifact(
      { ...discoveryWorkflow, flow: entry.flow },
      operations,
      discoveryProfile.engine,
    );
    helpers.set(id, prepared);
  }
  const result = await prepared.run(sourceJobInput(id, input));
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return id === 'source-request'
    ? result.value
    : {
        ...sourceJobInput('build-source', input),
        ...z.record(z.string(), z.json()).parse(result.value),
      };
};
try {
  let state = stateSchema.parse(
    await run('test-source', {
      ...initial,
      candidate: { selector: '[', fields: null, links: null, result: null },
    }),
  );
  const failure = state.feedback.failure;
  assert(JSON.stringify(failure).includes('HTML_SELECTOR'));
  for (const selector of ['article', 'h2']) {
    state = stateSchema.parse(
      await run('inspect-source', {
        ...state,
        action: {
          action: 'inspect',
          source: 0,
          query: { selector },
          window: { offset: 0, limit: 1 },
        },
      }),
    );
    assert.deepEqual(state.feedback.failure, failure);
    assert(JSON.stringify(state.feedback.inspection).includes(selector));
    const request = z
      .object({ messages: z.array(z.object({ content: z.string() })) })
      .parse(await run('source-request', state));
    const message = request.messages.find((m) => m.content.startsWith('CURRENT FEEDBACK'));
    assert(message);
    const offered = JSON.parse(message.content.slice(message.content.indexOf('\n') + 1));
    const original = JSON.parse(JSON.stringify(failure));
    assert.deepEqual(offered.failure.feedback, original.feedback);
    assert.deepEqual(offered.failure.trials, original.trials);
    assert.equal(offered.failure.rule.selector, original.rule.selector);
    assert(!Object.hasOwn(offered.failure.rule, 'preconditions'));
    assert.equal(offered.inspection.request.query.selector, selector);
    assert(!Object.hasOwn(offered.inspection.result, 'value'));
    assert(
      request.messages.some(
        (m) => m.content.includes('HTML VIEW METADATA') && m.content.includes('"items":['),
      ),
    );
    assert(request.messages.some((m) => m.content.includes('<h2>Current label</h2>')));
    assert.deepEqual(state.allowance, initial.allowance);
  }
  console.log(
    '[pass] source feedback: consecutive inspections preserve the exact active rejection in the real author request',
  );
  state = stateSchema.parse(
    await run('test-source', {
      ...state,
      candidate: { selector: ':not(', fields: null, links: null, result: null },
    }),
  );
  assert.notDeepEqual(state.feedback.failure, failure);
  assert.equal(state.feedback.inspection, null);
  state = stateSchema.parse(
    await run('test-source', {
      ...state,
      candidate: { selector: 'article', fields: null, links: null, result: null },
    }),
  );
  assert.deepEqual(state.feedback, { failure: null, inspection: null });
  assert.deepEqual(state.allowance, initial.allowance);
  assert.equal(effects, 0);
  const unavailableProcessing = stateSchema.parse(
    await run('test-source', {
      ...initial,
      part: 'initial',
      candidate: {
        selector: 'article',
        links: null,
        result: { reference: ['attributes', 'href'] },
      },
    }),
  );
  assert(JSON.stringify(unavailableProcessing.feedback.failure).includes('must be null'));
  const corrected = stateSchema.parse(
    await run('test-source', {
      ...unavailableProcessing,
      candidate: { selector: 'article', links: null, result: null },
    }),
  );
  assert.deepEqual(corrected.feedback, { failure: null, inspection: null });
  assert.equal(effects, 0);
  const bounded = { ...initial, observations: { ...discoveryProfile.observations, maxBytes: 1 } };
  const successfulBounded = await run('test-source', {
    ...bounded,
    candidate: { selector: 'article', fields: null, links: null, result: null },
  });
  assert.equal(
    z.object({ reason: z.string().nullable() }).parse(successfulBounded).reason,
    null,
    'Unused success feedback cannot discard a working source',
  );
  const rejectedBounded = await run('test-source', {
    ...bounded,
    candidate: { selector: '[', fields: null, links: null, result: null },
  });
  assert.equal(
    typeof z.object({ reason: z.string().nullable() }).parse(rejectedBounded).reason,
    'string',
    'Rejected feedback retains its byte ceiling',
  );
  console.log(
    '[pass] source feedback: a new rejection replaces the previous one; mechanical success clears both bounded values without effects',
  );
} finally {
  discovery.close();
  web.close();
}
