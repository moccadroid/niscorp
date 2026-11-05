import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { createJsonEncodingOperation } from '../src/discovery/review.js';
import { discoveryProfile, discoveryWorkflow } from '../src/discovery/index.js';

const encoding = createJsonEncodingOperation(discoveryProfile.engine.maxJsonDepth);
const prepared = new Map<string, Awaited<ReturnType<typeof prepareArtifact>>>();
const run = async (id: string, input: unknown) => {
  let artifact = prepared.get(id);
  if (!artifact) {
    const helper = discoveryWorkflow.flows.find((flow) => flow.id === id);
    assert(helper);
    artifact = await prepareArtifact(
      {
        stamp: discoveryWorkflow.stamp,
        data: discoveryWorkflow.data,
        flow: helper.flow,
        flows: discoveryWorkflow.flows.filter((flow) => flow.id === 'model-history'),
      },
      { 'json.encode': encoding },
      discoveryProfile.engine,
    );
    prepared.set(id, artifact);
  }
  const result = await artifact.run(input);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return result.value;
};

{
  const allowance = { steps: 6, ms: 30000 };
  for (const [meta, expected] of [
    [
      { steps: 1, elapsedMs: 25 },
      { steps: 5, ms: 29975 },
    ],
    [{ steps: 0, elapsedMs: 0 }, allowance],
    [{ steps: 2 }, { steps: 4, ms: 0 }],
    [{ elapsedMs: 100 }, { steps: 0, ms: 29900 }],
    [null, { steps: 0, ms: 0 }],
    [{}, { steps: 0, ms: 0 }],
    [
      { steps: 7, elapsedMs: 30001 },
      { steps: -1, ms: -1 },
    ],
  ]) {
    assert.deepEqual(await run('spend-model', { allowance, meta }), expected);
  }
  assert.deepEqual(allowance, { steps: 6, ms: 30000 });
  console.log(
    '[pass] model dataflow: one allowance accounts exact usage, zero usage, missing metadata and overruns without reading a discovery state',
  );

  const scope = { format: 'html', frontier: ['https://history.invalid/current'] };
  const observation = 'CURRENT OBSERVATION';
  const histories = [
    {
      job: 'source',
      scope,
      round: 0,
      messages: [
        { role: 'assistant', content: 'OWN PREVIOUS PROPOSAL' },
        { role: 'user', content: observation },
      ],
    },
    {
      job: 'source',
      scope: { format: 'html', frontier: ['https://history.invalid/other'] },
      round: 0,
      messages: [{ role: 'assistant', content: 'OTHER FRONTIER MUST STAY PRIVATE' }],
    },
    {
      job: 'output',
      scope: null,
      round: 0,
      messages: [{ role: 'assistant', content: 'OTHER JOB MUST STAY PRIVATE' }],
    },
  ];
  const repairFeedback = { accepted: false, reason: 'A requested association is missing.' };
  const input = { histories, repairCount: 1, repairFeedback, job: 'source', scope };
  const feedback = {
    role: 'user',
    content: 'REVIEW FEEDBACK ON THE PREVIOUS RESULT\n' + JSON.stringify(repairFeedback),
  };
  assert.deepEqual(await run('model-history', { ...input, observation }), {
    messages: [{ role: 'assistant', content: 'OWN PREVIOUS PROPOSAL' }, feedback],
    feedback: [feedback],
  });
  assert.deepEqual(await run('model-history', { ...input, repairFeedback: null }), {
    messages: histories[0]?.messages,
    feedback: [],
  });
  console.log(
    '[pass] model dataflow: history exposes only the exact job/frontier, omits the current observation and delivers new review feedback once',
  );

  const context = { component: 'selection' };
  const mechanicalFeedback = { failure: { code: 'HTML_SELECTOR' }, inspection: null };
  const model = { ok: true, decision: { action: 'propose', candidate: { selector: 'article' } } };
  const rememberInput = { ...input, context, feedback: mechanicalFeedback, model };
  const before = structuredClone(rememberInput);
  const remembered = await run('remember-author', rememberInput);
  const observationLabel = z
    .object({ observationLabel: z.string() })
    .parse(discoveryWorkflow.data).observationLabel;
  const appended = {
    job: 'source',
    scope,
    round: 1,
    messages: [
      feedback,
      { role: 'assistant', content: JSON.stringify({ data: model.decision }) },
      {
        role: 'user',
        content: observationLabel + JSON.stringify({ context, feedback: mechanicalFeedback }),
      },
    ],
  };
  assert.deepEqual(remembered, [...histories, appended]);
  assert.deepEqual(rememberInput, before);
  const current = await run('model-history', { ...input, histories: remembered });
  assert.deepEqual(current, {
    messages: [...(histories[0]?.messages ?? []), ...appended.messages],
    feedback: [],
  });
  for (const model of [null, { ok: false, decision: null }]) {
    assert.deepEqual(await run('remember-author', { ...rememberInput, model }), histories);
  }
  await assert.rejects(run('remember-author', { ...rememberInput, state: { private: 'body' } }));
  console.log(
    '[pass] model dataflow: remembering returns only history, preserves failed/skipped calls and records exact proposal/feedback without a state pass-through',
  );
}
