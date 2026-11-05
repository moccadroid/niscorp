import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { defineOperation } from '../src/engine/operation.js';
import { OperationFailure } from '../src/engine/control.js';
import { HtmlSelectorError } from '../src/readers/html/index.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';

// Malformed host configuration must fail before constructing an executable discovery.
let modelEvents = 0;
let httpRequests = 0;
for (const policy of [
  { representation: 'invalid' },
  { ...discoveryProfile.htmlContext.policy, clearTextIn: 'script' },
  { ...discoveryProfile.htmlContext.policy, clearContentsOf: [null] },
  { ...discoveryProfile.htmlContext.policy, unknown: true },
]) {
  assert.throws(
    () =>
      createDiscoveryOperations({
        author: { apiKey: 'unused-offline' },
        profile: {
          ...discoveryProfile,
          htmlContext: { ...discoveryProfile.htmlContext, policy },
        },
        record: () => {
          modelEvents++;
        },
        mechanical: {
          'http.get': defineOperation({
            input: z.json(),
            output: z.json(),
            run: () => {
              httpRequests++;
              return null;
            },
          }),
        },
      }),
    z.ZodError,
  );
}
assert.equal(modelEvents, 0);
assert.equal(httpRequests, 0);
for (const htmlContext of [
  {
    ...discoveryProfile.htmlContext,
    policy: { ...discoveryProfile.htmlContext.policy, clearContentsOf: ['['] },
  },
  {
    ...discoveryProfile.htmlContext,
    initialInspection: {
      ...discoveryProfile.htmlContext.initialInspection,
      selector: ':nth-child(nope)',
    },
  },
]) {
  assert.throws(
    () =>
      createDiscoveryOperations({
        author: { apiKey: 'unused-offline' },
        profile: { ...discoveryProfile, htmlContext },
        record: () => {
          modelEvents++;
        },
      }),
    HtmlSelectorError,
  );
}
assert.equal(modelEvents, 0);
assert.equal(httpRequests, 0);
const customPolicy = {
  ...discoveryProfile.htmlContext.policy,
  clearContentsOf: [],
  clearTextIn: [],
};
const custom = createDiscoveryOperations({
  author: { apiKey: 'unused-offline' },
  profile: {
    ...discoveryProfile,
    htmlContext: {
      ...discoveryProfile.htmlContext,
      policy: customPolicy,
      initialInspection: {
        ...discoveryProfile.htmlContext.initialInspection,
        selector: 'main:has(script)',
      },
    },
  },
});
try {
  const operation = custom.operations['html.prepareContext'];
  assert(operation);
  const result = await operation.run(
    {
      document: {
        url: 'https://boundary.invalid/custom',
        sha256: 'a'.repeat(64),
        encoding: 'utf-8',
        html: '<main>Source<script>retainedByCustomPolicy()</script></main>',
      },
      policy: customPolicy,
    },
    { signal: new AbortController().signal },
  );
  const prepared = z
    .object({ html: z.string(), report: z.object({ policy: z.json() }) })
    .parse(result);
  assert.match(prepared.html, /retainedByCustomPolicy/);
  assert.deepEqual(prepared.report.policy, customPolicy);
} finally {
  custom.close();
}
console.log(
  '[pass] profile admission: malformed HTML policies fail before model/HTTP effects; valid custom clearing policy is retained',
);

// These are actual composed helper boundaries, not model accuracy or replacement workflows.
const helper = (id: string) => {
  const found = discoveryWorkflow.flows?.find((flow) => flow.id === id);
  assert(found);
  return found;
};
let preparations = 0;
let failPreparation = false;
let downstream = 0;
const preparation = defineOperation({
  input: z.json(),
  output: z.json(),
  run() {
    preparations++;
    if (failPreparation)
      throw new OperationFailure('HTML_CONTEXT_PREPARE', 'Controlled preparation failure');
    return {};
  },
});
const effect = defineOperation({
  input: z.json(),
  output: z.json(),
  run(input) {
    downstream++;
    return input;
  },
});
const boundary = await prepareArtifact(
  {
    stamp: discoveryWorkflow.stamp,
    flows: [helper('html-context')],
    flow: {
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      steps: [
        {
          id: 'prepared',
          call: { flow: { id: 'html-context', revision: 1 } },
          input: { $ref: '$.input' },
        },
        { id: 'after', call: { operation: 'after' }, input: { $ref: '$.steps.prepared.value' } },
      ],
      output: { $ref: '$.steps.after.value' },
    },
  },
  { 'html.prepareContext': preparation, after: effect },
);
const document = {
  url: 'https://boundary.invalid/data',
  sha256: 'a'.repeat(64),
  encoding: 'utf-8',
  html: '<main>source</main>',
};
const input = {
  configuration: { ...discoveryProfile.htmlContext, enabled: false },
  documents: [{ status: 'completed', value: document, error: null }],
};
await assert.rejects(
  boundary.run({
    ...input,
    documents: [{ status: 'completed', value: { ...document, html: 1 }, error: null }],
  }),
);
assert.equal(preparations, 0);
assert.equal(downstream, 0);
console.log(
  '[pass] phase boundary: malformed consumed HTML fails before preparation or downstream effects',
);

await assert.rejects(
  boundary.run({ ...input, configuration: { ...input.configuration, enabled: true } }),
);
assert.equal(preparations, 1);
assert.equal(downstream, 0);
console.log('[pass] phase boundary: malformed preparation output fails before downstream effects');

const unchanged = structuredClone(input);
const bypass = await boundary.run(input);
assert.equal(bypass.status, 'completed');
assert.deepEqual(bypass.value, { documents: input.documents, reports: [] });
assert.equal(preparations, 1);
assert.equal(downstream, 1);
assert.deepEqual(input, unchanged);
console.log(
  '[pass] phase boundary: explicit false bypasses preparation and preserves source values',
);

failPreparation = true;
const failedPreparation = await boundary.run({
  ...input,
  configuration: { ...input.configuration, enabled: true },
});
assert.deepEqual(failedPreparation, {
  status: 'failed',
  value: null,
  error: { code: 'HTML_CONTEXT_PREPARE', message: 'Controlled preparation failure' },
});
assert.equal(preparations, 2);
assert.equal(downstream, 1);
assert.deepEqual(input, unchanged);
console.log(
  '[pass] phase boundary: ordinary preparation failure remains a concrete failure, never a produced document',
);

const accounting = await prepareArtifact(
  { stamp: discoveryWorkflow.stamp, flow: helper('spend-model').flow },
  {},
);
const allowance = { steps: 2, ms: 20 };
const unchangedAllowance = structuredClone(allowance);
const result = await accounting.run({ allowance, meta: { steps: 1, elapsedMs: 2 } });
assert.equal(result.status, 'completed');
assert.deepEqual(result.value, { steps: 1, ms: 18 });
assert.deepEqual(allowance, unchangedAllowance);
for (const meta of [null, {}]) {
  const exhausted = await accounting.run({ allowance, meta });
  assert.equal(exhausted.status, 'completed');
  assert.deepEqual(exhausted.value, { steps: 0, ms: 0 });
}
await assert.rejects(accounting.run({ allowance, meta: { steps: 'wrong', elapsedMs: 2 } }));
await assert.rejects(accounting.run({ allowance, meta: {}, state: { private: 'not-an-input' } }));
console.log(
  '[pass] phase boundary: accounting consumes only one typed allowance and usage, preserves its input, and rejects discovery-state coupling',
);
