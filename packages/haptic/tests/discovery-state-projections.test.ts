import assert from 'node:assert/strict';
import { evaluate } from '@niscorp/prism';
import { prepareArtifact } from '../src/index.js';
import { discoveryProfile } from '../src/discovery/index.js';
import workflow from '../src/discovery/discovery.json' with { type: 'json' };
import models from '../src/discovery/discovery-model.json' with { type: 'json' };
import sources from '../src/discovery/discovery-source.json' with { type: 'json' };

const helper = async (id: string, input: unknown): Promise<unknown> => {
  const entry = [...models.flows, ...sources.flows].find((flow) => flow.id === id);
  assert(entry);
  const prepared = await prepareArtifact(
    { stamp: workflow.stamp, data: workflow.data, flows: [], flow: entry.flow },
    {},
  );
  const result = await prepared.run(input);
  assert.equal(result.status, 'completed');
  return result.value;
};

const settings = discoveryProfile.settings;
const author = await helper('model-settings', {
  settings,
  allowance: { steps: 2, ms: 250 },
  responseAttempts: 3,
  stepLimit: 3,
});
assert.deepEqual(author, { ...settings, maxSteps: 2, outputAttempts: 2, maxMs: 250 });
const review = await helper('model-settings', {
  settings,
  allowance: { steps: 4, ms: 750 },
  responseAttempts: 3,
  stepLimit: 4,
});
assert.deepEqual(review, { ...settings, maxSteps: 4, outputAttempts: 3, maxMs: 750 });
const spent = await helper('model-settings', {
  settings,
  allowance: { steps: 1, ms: 25 },
  responseAttempts: 3,
  stepLimit: 4,
});
assert.deepEqual(spent, { ...settings, maxSteps: 1, outputAttempts: 1, maxMs: 25 });
console.log('[pass] shared model settings preserve separate response and owner step/time ceilings');

assert.deepEqual(
  await helper('model-budget', {
    author: discoveryProfile.author,
    review: discoveryProfile.review,
  }),
  {
    author: {
      steps: discoveryProfile.author.maxModelSteps,
      ms: discoveryProfile.author.maxModelMs,
    },
    review: {
      steps: discoveryProfile.review.maxModelSteps,
      ms: discoveryProfile.review.maxModelMs,
    },
  },
);
assert.equal(
  await helper('model-error', { prefix: 'Source author failed.', model: { ok: true } }),
  null,
);
assert.equal(
  await helper('model-error', {
    prefix: 'Source author failed.',
    model: { ok: false, error: { code: 'example', message: 'Actual failure' } },
  }),
  'Source author failed. example: Actual failure',
);
assert.equal(
  await helper('model-error', { prefix: 'Mapping author failed.', model: null }),
  'Mapping author failed. UNKNOWN: No provider error detail was returned.',
);
console.log(
  '[pass] shared budget and model-error projections preserve actual owner values and failures',
);

const sourceTrial = {
  id: 'source',
  status: 'completed',
  value: {
    source: {
      url: 'https://example.invalid/source',
      body: { base64: 'private-body' },
      encoded: { base64: 'private-encoded' },
    },
    selection: { items: [{ text: 'value' }] },
    urls: ['https://example.invalid/next'],
  },
  error: null,
};
const failedTrial = {
  id: 'failed',
  status: 'failed',
  value: null,
  error: { code: 'FIELD', message: 'Actual mismatch' },
};
assert.deepEqual(await helper('source-trials', { trials: [sourceTrial, failedTrial] }), [
  {
    ...sourceTrial,
    value: { ...sourceTrial.value, source: { url: sourceTrial.value.source.url } },
  },
  failedTrial,
]);
assert.equal(sourceTrial.value.source.body.base64, 'private-body');
console.log(
  '[pass] retained source trials keep selections, URLs and failures without copying raw capture bodies',
);

const sentinel = 'private-source-body-not-public'.repeat(10000);
const policy = discoveryProfile.traversal;
const meta = {
  usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, reported: true },
  steps: 1,
  elapsedMs: 5,
  outputRetries: 0,
  strategy: 'emit',
};
const privateState = {
  published: true,
  artifact: { recipe: 'ordinary-json-artifact' },
  schema: { type: 'array' },
  reason: null,
  fresh: {
    status: 'completed',
    value: {
      data: ['current-value'],
      visited: ['https://example.invalid'],
      limited: false,
      redirects: [],
    },
    error: null,
  },
  partialTrial: null,
  task: { requiresNavigation: false, resultFlow: null },
  declaration: { rawSources: [sentinel] },
  levels: [{ sources: [sentinel], documents: [sentinel], trials: [sentinel] }],
  review: {
    ok: true,
    decision: { accepted: true, reason: 'supported' },
    error: null,
    meta,
    rawSources: [{ text: sentinel }],
  },
  budget: { author: { steps: 5, ms: 100 }, review: { steps: 2, ms: 50 } },
  repairCount: 1,
  repairWarning: null,
};
const providerProjection = workflow.flow.steps.find((step) => step.id === 'provider-block');
assert(providerProjection && 'value' in providerProjection);
const project = (state: unknown) => {
  const steps = { result: { value: state }, profile: { value: { policy } } };
  return evaluate(workflow.flow.output, {
    steps: { ...steps, 'provider-block': { value: evaluate(providerProjection.value, { steps }) } },
  });
};
const result = project(privateState);
assert(result && typeof result === 'object' && !Array.isArray(result));
assert.equal(result.status, 'ready');
assert.deepEqual(result.artifact, privateState.artifact);
assert.deepEqual(result.trial, privateState.fresh);
assert.deepEqual(result.review, {
  ok: true,
  decision: privateState.review.decision,
  error: null,
  meta,
});
assert.deepEqual(result.author, { remaining: privateState.budget, attempt: 2 });
assert(!Object.hasOwn(result, 'levels'));
assert(!Object.hasOwn(result, 'declaration'));
assert(!JSON.stringify(result).includes('private-source-body-not-public'));
assert.equal(privateState.levels[0]?.sources[0], sentinel);
const unresolved = project({
  ...privateState,
  published: false,
  artifact: null,
  fresh: null,
  review: null,
  reason: 'Concrete failure',
});
assert(unresolved && typeof unresolved === 'object' && !Array.isArray(unresolved));
assert.equal(unresolved.status, 'unresolved');
assert.equal(unresolved.artifact, null);
assert.equal(unresolved.review, null);
assert.equal(unresolved.reason, 'Concrete failure');
console.log(
  '[pass] actual public projection preserves results/limits/budgets and omits captures, trial state and rejected source bodies',
);
