import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact, defineOperation } from '../src/index.js';
import { discoveryProfile, discoveryWorkflow } from '../src/discovery/index.js';
import { createTrialOperation } from '../src/discovery/trial.js';
import { DiscoveryModelInputSchema } from '../src/discovery/model.js';
import { searchWorkflow, searchProfile } from '../src/search/index.js';
import type { JsonValue, Operation } from '../src/engine/contracts.js';
const signal = new AbortController().signal;
let checks = 0;
const check = async (name: string, run: () => Promise<void>) => {
  await run();
  checks++;
  console.log('[pass] builder ownership: ' + name);
};
const modelEnvelope = (decision: JsonValue, steps = 1, elapsedMs = 1) => ({
  ok: true,
  decision,
  error: null,
  meta: {
    steps,
    elapsedMs,
    outputRetries: 0,
    strategy: 'emit',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false },
  },
  rawSources: [],
});
let bindings = 0,
  executions = 0;
const effect = defineOperation({
  input: z.number(),
  output: z.number(),
  run(value) {
    executions++;
    return value + 1;
  },
});
const counted: Operation = {
  inputSchema: effect.inputSchema,
  outputSchema: effect.outputSchema,
  get run() {
    bindings++;
    return effect.run;
  },
};
const artifact = {
  stamp: discoveryWorkflow.stamp,
  flow: {
    inputSchema: { type: 'number' },
    outputSchema: { type: 'number' },
    steps: [{ id: 'value', call: { operation: 'increment' }, input: { $ref: '$.input' } }],
    output: { $ref: '$.steps.value.value' },
  },
};
const trials = createTrialOperation({ increment: counted }, discoveryProfile.trial);
const outcomes = z.object({
  outcomes: z.array(
    z.object({ id: z.string(), status: z.string(), value: z.json(), error: z.json() }),
  ),
});
await check(
  'one candidate is prepared once for three trials; a changed candidate is prepared separately',
  async () => {
    const result = outcomes.parse(
      await trials.run(
        {
          artifact,
          cases: [
            { id: 'one', input: 1 },
            { id: 'two', input: 2 },
            { id: 'three', input: 3 },
          ],
        },
        { signal },
      ),
    );
    assert.equal(bindings, 1);
    assert.equal(executions, 3);
    assert.deepEqual(
      result.outcomes.map((x) => x.value),
      [2, 3, 4],
    );
    await trials.run(
      {
        artifact: { ...artifact, flow: { ...artifact.flow, output: 99 } },
        cases: [{ id: 'changed', input: 4 }],
      },
      { signal },
    );
    assert.equal(bindings, 2);
    assert.equal(executions, 4);
  },
);
await check(
  'bad operation, expression and schema candidates are rejected before any effects',
  async () => {
    for (const invalid of [
      {
        ...artifact,
        flow: {
          ...artifact.flow,
          steps: [{ id: 'bad', call: { operation: 'not-available' }, input: 1 }],
        },
      },
      { ...artifact, flow: { ...artifact.flow, output: { $noSuchOperation: 1 } } },
      { ...artifact, flow: { ...artifact.flow, inputSchema: { type: 'not-a-type' } } },
      { ...artifact, extra: 'not-grammar' },
    ]) {
      const before = executions;
      const result = outcomes.parse(
        await trials.run({ artifact: invalid, cases: [{ id: 'bad', input: 1 }] }, { signal }),
      );
      assert.equal(result.outcomes[0]?.status, 'rejected');
      assert.equal(executions, before);
    }
  },
);
await check(
  'trial observations cannot mutate outcomes; evidence failure remains terminal',
  async () => {
    const observed = createTrialOperation(
      { increment: counted },
      discoveryProfile.trial,
      (event) => {
        if (event && typeof event === 'object' && !Array.isArray(event)) event.outcome = null;
      },
    );
    assert.equal(
      outcomes.parse(await observed.run({ artifact, cases: [{ id: 'ok', input: 1 }] }, { signal }))
        .outcomes[0]?.value,
      2,
    );
    const failed = createTrialOperation({ increment: counted }, discoveryProfile.trial, () => {
      throw new Error('audit-failed');
    });
    await assert.rejects(
      failed.run({ artifact, cases: [{ id: 'ok', input: 1 }] }, { signal }),
      /audit-failed/,
    );
  },
);

const rewriteFlow = searchWorkflow.flows.find((f) => f.id === 'search-query-candidate');
assert(rewriteFlow);
const rewrite = async (answers: JsonValue[]) => {
  let calls = 0;
  const prepared = await prepareArtifact(
    {
      stamp: searchWorkflow.stamp,
      flow: rewriteFlow.flow,
      flows: searchWorkflow.flows.filter((f) =>
        ['search-query-candidate', 'model-allowance'].includes(f.id),
      ),
    },
    {
      'search.rewrite': defineOperation({
        input: DiscoveryModelInputSchema,
        output: z.json(),
        run() {
          calls++;
          const answer = answers.shift();
          assert(answer !== undefined);
          return answer;
        },
      }),
    },
  );
  const outcome = await prepared.run({
    instruction: 'Find sources',
    attempts: [{ query: 'old' }],
    policy: searchProfile.rewrite,
    maxInputBytes: searchProfile.maxInputBytes,
  });
  return { calls, outcome };
};
await check(
  'query-repeat policy repairs in JSON and distinguishes legitimate decline from provider failure',
  async () => {
    const repaired = await rewrite([
      modelEnvelope({ query: 'old' }),
      modelEnvelope({ query: 'new' }),
    ]);
    assert.equal(repaired.calls, 2);
    assert.deepEqual(repaired.outcome.value, { query: 'new' });
    const declined = await rewrite([modelEnvelope({ query: null })]);
    assert.equal(declined.outcome.status, 'completed');
    assert.deepEqual(declined.outcome.value, { query: null });
    const exhausted = await rewrite([modelEnvelope({ query: 'old' }, 3)]);
    assert.deepEqual(exhausted.outcome.value, { query: null });
    assert.equal(exhausted.calls, 1);
    const failed = await rewrite([
      {
        ok: false,
        decision: null,
        error: { code: 'QUOTA', message: 'Unavailable' },
        meta: { steps: 1, elapsedMs: 1 },
      },
    ]);
    assert.equal(failed.outcome.status, 'failed');
    assert.match(failed.outcome.error?.message ?? '', /SEARCH_REWRITE_FAILED/);
  },
);
console.log(`Builder ownership: ${checks} offline behavior groups passed; no paid calls.`);
