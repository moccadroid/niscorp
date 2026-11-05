import assert from 'node:assert/strict';
import { z } from 'zod';
import { PrismError, ErrorCode } from '@niscorp/prism';
import { createTrialOperation, TrialResultSchema } from '../src/discovery/trial.js';
import { ArtifactError } from '../src/engine/errors.js';
import { RunControl } from '../src/engine/control.js';
import { defineOperation } from '../src/engine/operation.js';
import type { JsonValue, Operations } from '../src/engine/contracts.js';
import profile from '../src/engine/default-profile.json' with { type: 'json' };
import mechanical from '../src/discovery/mechanical.json' with { type: 'json' };

const artifact = (output: JsonValue, outputSchema: JsonValue = {}) => ({
  stamp: mechanical.stamp,
  flow: { inputSchema: { type: 'object' }, outputSchema, steps: [], output },
});
const run = async (
  document: JsonValue,
  operations: Operations = {},
  limits = profile,
  signal = new AbortController().signal,
) => {
  const result = await createTrialOperation(operations, limits).run(
    { artifact: document, cases: [{ id: 'source', input: { items: ['Alpha', 'Beta'] } }] },
    { signal },
  );
  const parsed = z.object({ outcomes: z.array(TrialResultSchema) }).parse(result);
  assert.equal(parsed.outcomes.length, 1);
  const outcome = parsed.outcomes[0];
  assert(outcome);
  return outcome;
};

const wrong = await run(artifact({ $ref: '$.items' }));
assert.equal(wrong.status, 'rejected');
assert.deepEqual(
  z.object({ code: z.string(), op: z.string(), path: z.string() }).parse(wrong.error),
  { code: ErrorCode.MISSING_PATH, op: '$ref', path: '$.items' },
);
const correct = await run(artifact({ $ref: '$.input.items' }));
assert.equal(correct.status, 'completed');
assert.deepEqual(correct.value, ['Alpha', 'Beta']);
assert.equal(correct.error, null);
console.log(
  '[pass] trial diagnostics: an actual wrong-root Prism path survives; correct root succeeds',
);

const invalidOutput = await run(artifact(42, { type: 'string' }));
assert.equal(invalidOutput.status, 'rejected');
assert.deepEqual(z.object({ code: z.string(), path: z.string() }).parse(invalidOutput.error), {
  code: 'INVALID_VALUE',
  path: '$',
});
console.log('[pass] trial diagnostics: an actual artifact output-boundary path survives');

const failingArtifact = {
  ...artifact(null),
  flow: {
    ...artifact(null).flow,
    steps: [{ id: 'failure', call: { operation: 'fixture.failure' }, input: null }],
  },
};
const failing = (error: Error): Operations => ({
  'fixture.failure': defineOperation({
    input: z.null(),
    output: z.null(),
    run() {
      throw error;
    },
  }),
});
for (const error of [
  new PrismError('Controlled failure', ErrorCode.TYPE, {
    op: '$map',
    path: '$.input.records',
    details: { body: 'PRIVATE_BODY_SENTINEL', credentials: 'PRIVATE_KEY_SENTINEL' },
  }),
  new ArtifactError('INVALID_VALUE', 'Controlled failure', '$/result', {
    cause: { body: 'PRIVATE_BODY_SENTINEL', credentials: 'PRIVATE_KEY_SENTINEL' },
  }),
]) {
  const result = await run(failingArtifact, failing(error));
  assert.equal(result.status, 'rejected');
  assert(!JSON.stringify(result).includes('PRIVATE_'));
  assert(!JSON.stringify(result).includes('details'));
  assert(!JSON.stringify(result).includes('cause'));
}
console.log(
  '[pass] trial diagnostics: only known op/path context is copied, never details or causes',
);

await assert.rejects(
  run(
    artifact({ $map: { over: [1, 2], as: 'item', body: { $add: [{ $var: 'item' }, 1] } } }),
    {},
    { ...profile, prism: { ...profile.prism, maxSteps: 1 } },
  ),
  (error: unknown) => error instanceof PrismError && error.code === ErrorCode.BUDGET,
);
for (const error of [new RunControl('CANCELLED', 'Cancelled'), new RunControl('ITEMS', 'Limit')])
  await assert.rejects(run(failingArtifact, failing(error)), (caught: unknown) => caught === error);
const controller = new AbortController();
controller.abort(new RunControl('CANCELLED', 'Caller cancelled'));
await assert.rejects(run(artifact(null), {}, profile, controller.signal), { code: 'CANCELLED' });
console.log(
  '[pass] trial diagnostics: Prism budgets, resource controls and cancellation remain terminal',
);
