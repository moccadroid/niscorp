import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { ArtifactSchema } from '../src/engine/schema.js';
import {
  discoveryWorkflow,
  discoveryProfile,
  HtmlAuthorOutputSchema,
} from '../src/discovery/index.js';
import { blueprint as mechanical } from '../src/discovery/blueprint.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import fixtures from './fixtures/reuse/procedures/cases.json' with { type: 'json' };
import learned from './fixtures/reuse/cases.json' with { type: 'json' };
import { preparePolicy } from './helpers/discovery-policy.js';
const preconditionPolicy = await preparePolicy('precondition-admission');
const checkPreconditions = async (rules: unknown[]) => {
  const outcome = await preconditionPolicy.run({ rules });
  assert.equal(outcome.status, 'completed');
  return z.object({ accepted: z.boolean() }).parse(outcome.value);
};

type Rule = z.infer<typeof HtmlAuthorOutputSchema>;
const anchor = { selector: 'h1:contains("Download")', minimum: 1, maximum: 1 };
const binder = await prepareArtifact(
  {
    stamp: discoveryWorkflow.stamp,
    flows: discoveryWorkflow.flows.filter((flow) =>
      ['bind', 'precondition-admission'].includes(flow.id),
    ),
    flow: {
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      steps: [
        { id: 'bound', call: { flow: { id: 'bind', revision: 1 } }, input: { $ref: '$.input' } },
      ],
      output: { $ref: '$.steps.bound.value' },
    },
  },
  {},
);
const bind = async (stages: Rule[], mode = 'walk', resources = false) => {
  const result = await binder.run({
    mode,
    rule: stages[0] ?? null,
    stages,
    task: {
      requiresNavigation: false,
      resultFlow: resources ? { id: 'fetch-resources', revision: 1 } : null,
    },
    blueprint: mechanical,
    formats: discoveryProfile.formats,
    policy: { ...discoveryProfile.traversal, allowLinkFollowing: true, maxPages: 8 },
    resources: { ...discoveryProfile.resources, allowResourceFetching: resources },
    minimumResultMatches: 0,
    canFollow: true,
    seen: [],
  });
  assert.equal(result.status, 'completed');
  return result.value;
};
const selected = z.object({
  pages: z.array(
    z.object({ items: z.array(z.object({ attributes: z.record(z.string(), z.string()) })) }),
  ),
});
const web = createWebOperations();
const get = web.operations['http.get'],
  select = web.operations['html.select'];
assert(get && select);
const sources = new Map<string, string>();
const selections: string[] = [];
const acquired: string[] = [];
const operations = {
  ...web.operations,
  'http.get': {
    ...get,
    async run(input: unknown) {
      const { url } = z.object({ url: z.string() }).parse(input);
      acquired.push(url);
      const html = sources.get(url);
      assert(html !== undefined, 'Unexpected offline acquisition: ' + url);
      const body = captureBody(Buffer.from(html));
      return { url, status: 200, headers: { 'content-type': ['text/html'] }, encoded: body, body };
    },
  },
  'html.select': {
    ...select,
    async run(...args: Parameters<typeof select.run>) {
      selections.push(z.object({ selector: z.string() }).parse(args[0]).selector);
      return select.run(...args);
    },
  },
};
const execute = async (document: unknown, html: string) => {
  selections.length = 0;
  acquired.length = 0;
  sources.set(fixtures.sourceUrl, html);
  return (await prepareArtifact(document, operations)).run({ url: fixtures.sourceUrl });
};
const rows = [];
try {
  const examples = await Promise.all(
    fixtures.examples.map(async (entry) => {
      const bytes = await readFile(
        new URL('./fixtures/reuse/procedures/' + entry.file, import.meta.url),
      );
      assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
      return { ...entry, html: bytes.toString('utf8') };
    }),
  );
  for (const example of learned.cases) {
    const rule: Rule = { ...example.rules, preconditions: [anchor] };
    const artifact = await bind([rule]);
    for (const page of examples) {
      const outcome = await execute(artifact, page.html);
      if ('failure' in page) {
        assert.equal(outcome.status, 'failed');
        assert.equal(outcome.error?.code, 'CHECK_FAILED');
        assert.equal(
          outcome.error?.message,
          'Check failed: discovery-required-precondition:' + JSON.stringify(anchor),
        );
        assert.deepEqual(selections, [anchor.selector], 'No extraction after failed context');
        rows.push({ rule: example.id, page: page.id, status: 'caught-context-failure' });
      } else {
        assert.equal(outcome.status, 'completed');
        const actual = selected
          .parse(outcome.value)
          .pages.flatMap((p) => p.items.map((i) => i.attributes.href));
        const expected = example.id.startsWith('fixed') ? page.fixed : page.current;
        const knownWrong = example.knownWrongVariants.includes(page.id);
        if (knownWrong) assert.notDeepEqual(actual, expected, example.id + ': ' + page.id);
        else assert.deepEqual(actual, expected, example.id + ': ' + page.id);
        rows.push({
          rule: example.id,
          page: page.id,
          status: knownWrong ? 'undetected-wrong-result' : 'correct-result',
          actual,
          expected,
        });
      }
    }
  }
  assert(
    rows.some((r) => r.status === 'undetected-wrong-result'),
    'Declared context cannot establish completeness',
  );
  const base: Rule = { selector: 'main a', links: null, result: null, preconditions: [] };
  const two = { selector: 'h2', minimum: 1, maximum: null };
  const guarded = await bind([{ ...base, preconditions: [anchor, two, anchor] }]);
  const failure = await execute(guarded, '<h1>Download</h1><main><a href="/a">A</a></main>');
  assert.equal(failure.status, 'failed');
  assert.equal(
    failure.error?.message,
    'Check failed: discovery-required-precondition:' + JSON.stringify(two),
  );
  assert.deepEqual(selections, [anchor.selector, 'h2']);
  const success = await execute(guarded, '<h1>Download</h1><h2>A</h2><h2>B</h2><main></main>');
  assert.equal(success.status, 'completed');
  assert.deepEqual(selected.parse(success.value).pages, []);
  assert.deepEqual(selections, [anchor.selector, 'h2', 'main a']);
  const reordered = { maximum: anchor.maximum, minimum: anchor.minimum, selector: anchor.selector };
  const reorderedArtifact = await bind([{ ...base, preconditions: [reordered, anchor] }]);
  const reorderedFailure = await execute(reorderedArtifact, '<main></main>');
  assert.equal(reorderedFailure.status, 'failed', 'Property order cannot skip a required guard');
  assert.equal(
    reorderedFailure.error?.message,
    'Check failed: discovery-required-precondition:' + JSON.stringify(anchor),
  );
  const reorderedSuccess = await execute(reorderedArtifact, '<h1>Download</h1><main></main>');
  assert.equal(reorderedSuccess.status, 'completed');
  assert.deepEqual(
    selections,
    [anchor.selector, 'main a'],
    'Equivalent declarations execute once regardless of key order',
  );
  const firstBinding = ArtifactSchema.parse(await bind([{ ...base, preconditions: [anchor] }]));
  const stableBinding = {
    ...firstBinding,
    flows: firstBinding.flows.map((helper) => ({
      ...helper,
      flow: {
        ...helper.flow,
        output: { $with: { let: { unrelated: true }, value: helper.flow.output } },
      },
    })),
  };
  const stableSuccess = await execute(stableBinding, '<h1>Download</h1><main></main>');
  assert.equal(stableSuccess.status, 'completed');
  assert.deepEqual(selections, [anchor.selector, 'main a']);
  const stableFailure = await execute(stableBinding, '<main></main>');
  assert.equal(stableFailure.status, 'failed');
  assert.equal(
    stableFailure.error?.message,
    'Check failed: discovery-required-precondition:' + JSON.stringify(anchor),
  );
  assert.deepEqual(selections, [anchor.selector]);
  console.log(
    '[pass] preconditions: learned conditions remain literal data; equivalent helper changes preserve exact failures',
  );
  const duplicate = await execute(
    guarded,
    '<h1>Download</h1><h1>Download</h1><h2>A</h2><main></main>',
  );
  assert.equal(duplicate.status, 'failed');
  assert.equal(
    duplicate.error?.message,
    'Check failed: discovery-required-precondition:' + JSON.stringify(anchor),
  );
  for (const preconditions of [[], [{ selector: '.absent', minimum: 0, maximum: 0 }]]) {
    const empty = await execute(await bind([{ ...base, preconditions }]), '<main></main>');
    assert.equal(empty.status, 'completed');
    assert.deepEqual(selected.parse(empty.value).pages, []);
  }
  const invalidRules = [
    { ...base, preconditions: [{ selector: base.selector, minimum: 1, maximum: null }] },
    { ...base, links: 'nav a', preconditions: [{ selector: 'nav a', minimum: 1, maximum: null }] },
    { ...base, preconditions: [{ ...anchor, minimum: 2 }] },
    {
      selector: "meta[name='citation_pdf_url']",
      links: null,
      result: null,
      preconditions: [{ selector: "meta[name='citation_pdf_url']", minimum: 1, maximum: null }],
    },
  ];
  for (const rule of invalidRules) {
    assert.equal((await checkPreconditions([rule])).accepted, false);
    const invalid = await binder.run({
      mode: 'walk',
      stages: [rule],
      blueprint: mechanical,
      task: { requiresNavigation: false, resultFlow: null },
      policy: discoveryProfile.traversal,
      resources: discoveryProfile.resources,
      formats: discoveryProfile.formats,
      minimumResultMatches: 0,
    });
    assert.equal(invalid.status, 'failed');
    assert.equal(invalid.error?.message, 'Check failed: invalid-preconditions');
  }
  for (const rule of [base, { ...base, preconditions: [anchor] }])
    assert.equal((await checkPreconditions([rule])).accepted, true);
  assert.equal(
    (
      await checkPreconditions([
        {
          ...base,
          preconditions: [{ selector: 'main > a', minimum: 1, maximum: null }],
        },
      ])
    ).accepted,
    true,
    'Exact comparison does not establish semantic independence of different CSS',
  );
  const stage = await execute(
    await bind([{ ...base, preconditions: [anchor] }], 'stage'),
    '<h1>Other</h1>',
  );
  assert.equal(stage.status, 'failed', 'Stage trials enforce the same bound preconditions');
  const resourceArtifact = await bind(
    [
      {
        ...base,
        preconditions: [anchor],
        result: {
          flow: { id: 'fetch-resources', revision: 1 },
          input: { reference: ['attributes', 'href'] },
        },
      },
    ],
    'walk',
    true,
  );
  const noDownloads = await execute(resourceArtifact, '<main><a href="/file.pdf">File</a></main>');
  assert.equal(noDownloads.status, 'failed');
  assert.equal(noDownloads.error?.code, 'CHECK_FAILED');
  assert.deepEqual(
    acquired,
    [fixtures.sourceUrl],
    'Failed preconditions prevent resource acquisition',
  );

  const start = 'https://example.test/root',
    leaf = 'https://example.test/leaf';
  const first = { selector: 'main', minimum: 1, maximum: 1 };
  const second = { selector: 'article', minimum: 1, maximum: 1 };
  sources.set(start, '<main><a href="/leaf">Next</a></main>');
  sources.set(leaf, '<article><p>Data</p></article>');
  const tree = await bind([
    { selector: null, links: 'main a', result: null, preconditions: [first] },
    { selector: 'article p', links: null, result: null, preconditions: [second] },
  ]);
  selections.length = 0;
  const treeResult = await (await prepareArtifact(tree, operations)).run({ url: start });
  assert.equal(treeResult.status, 'completed');
  assert.deepEqual(
    selections,
    ['main', 'main a', 'article', 'article p'],
    'Other-stage preconditions are skipped',
  );
  sources.set(leaf, '<section><p>Changed layout</p></section>');
  const brokenTree = await (await prepareArtifact(tree, operations)).run({ url: start });
  assert.equal(brokenTree.status, 'failed');
  assert.equal(
    brokenTree.value,
    null,
    'No partial result is published after a later-stage guard fails',
  );
  assert.equal(
    brokenTree.error?.message,
    'Check failed: discovery-required-precondition:' + JSON.stringify(second),
  );
  const shared = { selector: 'html', minimum: 1, maximum: 1 };
  const sharedTree = await bind([
    { selector: null, links: 'main a', result: null, preconditions: [first, shared] },
    { selector: 'article p', links: null, result: null, preconditions: [second, shared] },
  ]);
  sources.set(leaf, '<article><p>Data</p></article>');
  selections.length = 0;
  const sharedResult = await (await prepareArtifact(sharedTree, operations)).run({ url: start });
  assert.equal(sharedResult.status, 'completed');
  assert.equal(
    selections.filter((s) => s === 'html').length,
    2,
    'Shared condition runs once on each source',
  );

  const directory = resolve(
    'data/runs/preconditions-offline-' + new Date().toISOString().replaceAll(/[:.]/g, '-'),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'results.json'),
    JSON.stringify(
      {
        kind: 'Offline execution of manually declared conditions with unchanged saved rules; not model accuracy',
        modelCalls: 0,
        networkCalls: 0,
        rows,
        caught: rows.filter((r) => r.status === 'caught-context-failure').length,
        correct: rows.filter((r) => r.status === 'correct-result').length,
        missed: rows.filter((r) => r.status === 'undetected-wrong-result').length,
      },
      null,
      2,
    ),
  );
  console.log(
    'Discovery preconditions: 28 saved-rule replays plus bounds, empty results, exact failures, deduplication and stage isolation checked. Evidence: ' +
      directory,
  );
} finally {
  web.close();
}
