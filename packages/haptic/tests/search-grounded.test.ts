import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import type { JsonValue } from '../src/engine/contracts.js';
import { defineOperation } from '../src/engine/operation.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import { discoveryProfile } from '../src/discovery/index.js';
import { createPrepareOperation, createTrialOperation } from '../src/discovery/trial.js';
import { createSearchOperations, searchProfile, searchWorkflow } from '../src/search/index.js';

const instruction = 'Return the current record names from the useful source as an array.';
const query = 'record directory';
const asOf = '2026-11-01T17:00:00+01:00';
const destination = 'https://destination.invalid/records';
const outputSchema = { type: 'array', items: { type: 'string' } };
const pageOptions = {
  allowLinkFollowing: false,
  linkDepth: 0,
  maxPages: 1,
  allowResourceFetching: false,
  maxResources: 0,
  outputSchema,
};
let names = ['First', 'Second'];
const searchHtml =
  '<main><div class="result"><a class="result__a" href="https://duckduckgo.com/l/?uddg=' +
  encodeURIComponent(destination) +
  '">Useful record directory</a><p class="result__snippet">Current records and their names.</p></div></main>';
const source = (url: string, html: string) => {
  const body = captureBody(Buffer.from(html));
  return { url, status: 200, headers: { 'content-type': ['text/html'] }, body, encoded: body };
};
const gets: string[] = [];
const host = createWebOperations();
const search = createSearchOperations({ author: { apiKey: 'unused-offline' } });
const http = defineOperation({
  input: z.object({ url: z.string() }).strict(),
  output: HttpSourceSchema,
  run(input) {
    gets.push(input.url);
    const target = new URL(input.url);
    const provider = new URL(searchProfile.provider.endpoint);
    if (target.origin === provider.origin && target.pathname === provider.pathname) {
      assert.equal(target.searchParams.get(searchProfile.provider.queryParameter), query);
      return source(input.url, searchHtml);
    }
    assert.equal(input.url, destination, 'Unexpected destination or unauthorized onward request');
    return source(
      input.url,
      '<nav><a href="/unwanted">Menu</a></nav><main>' +
        names.map((name) => '<article><h2>' + name + '</h2></article>').join('') +
        '<a href="/unwanted">Do not follow</a></main>',
    );
  },
});
const mechanical = { ...host.operations, 'http.get': http };
const modelInput = z
  .object({
    messages: z.array(z.object({ role: z.string(), content: z.string() })),
  })
  .loose();
type ModelInput = z.output<typeof modelInput>;
type Reply = JsonValue | ((request: ModelInput) => JsonValue);
const calls: { name: string; request: ModelInput }[] = [];
const rule = {
  preconditions: [{ selector: 'main', minimum: 1, maximum: 1 }],
  selector: 'main article',
  fields: { caption: { selector: 'h2', attribute: null, minimum: 1, maximum: 1 } },
  links: null,
  result: null,
};
const mapping = {
  $map: {
    over: { $ref: '$.input.records' },
    as: 'record',
    body: { $get: { from: { $var: 'record' }, path: ['fields', 'caption', 0] } },
  },
};
const replies: Record<string, Reply[]> = {
  'search.rank': [
    (request) => {
      const payload = z
        .object({
          instruction: z.string(),
          query: z.string(),
          asOf: z.string(),
          maxResults: z.number(),
          results: z.array(z.object({ id: z.string(), url: z.string(), title: z.string() })),
          perDestination: z.json(),
        })
        .parse(JSON.parse(request.messages[0]?.content ?? ''));
      assert.equal(payload.instruction, instruction);
      assert.equal(payload.query, query);
      assert.equal(payload.asOf, asOf);
      assert.equal(payload.maxResults, 1);
      assert.deepEqual(payload.perDestination, { ...pageOptions, asOf });
      assert.equal(payload.results.length, 1);
      assert.equal(payload.results[0]?.url, destination);
      assert.equal(payload.results[0]?.title, 'Useful record directory');
      return { rankedIds: payload.results.map((result) => result.id) };
    },
  ],
  'task.declare': [{ requiresNavigation: false, resultFlow: null }],
  'author.html': [{ action: 'propose', candidate: rule }],
  'author.output': [mapping],
  'result.review': [
    { accepted: true, reason: 'Controlled protocol verdict for the two source-supported names.' },
  ],
};
const operations = { ...search.operations };
for (const name of Object.keys(operations).filter(
  (name) =>
    name.startsWith('author.') ||
    ['task.declare', 'result.contract', 'result.review', 'search.rank', 'search.rewrite'].includes(
      name,
    ),
)) {
  operations[name] = defineOperation({
    input: modelInput,
    output: z.json(),
    run(request) {
      calls.push({ name, request: structuredClone(request) });
      const reply = replies[name]?.shift();
      assert.notEqual(
        reply,
        undefined,
        'Unexpected model operation in actual search composition: ' + name,
      );
      assert(reply !== undefined);
      if (name !== 'search.rank') {
        assert(request.messages.some((message) => message.content.includes(instruction)));
        assert(request.messages.some((message) => message.content === 'AS OF\n' + asOf));
      }
      if (name === 'author.output') {
        assert(!Object.hasOwn(request, 'instructions'));
        assert(!Object.hasOwn(request, 'documentation'));
        assert(
          request.messages.some((message) =>
            message.content.startsWith('TRANSFORMATION REQUIREMENTS\n'),
          ),
        );
        assert(
          request.messages.some((message) =>
            message.content.startsWith('EXAMPLE PROGRAM CONTEXTS'),
          ),
        );
        assert(
          !request.messages.some((message) =>
            message.content.startsWith('UNTRUSTED html SOURCE\n'),
          ),
        );
      }
      return {
        ok: true,
        decision: typeof reply === 'function' ? reply(request) : reply,
        error: null,
        meta: {
          steps: 1,
          outputRetries: 0,
          elapsedMs: 1,
          strategy: 'emit',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false },
        },
        rawSources: [],
      };
    },
  });
}

try {
  const prepared = await prepareArtifact(
    searchWorkflow,
    {
      ...operations,
      'http.get': http,
      'artifact.prepare': createPrepareOperation(mechanical, discoveryProfile.engine),
      'artifact.trial': createTrialOperation(mechanical, discoveryProfile.trial),
    },
    search.limits,
  );
  const outcome = await prepared.run({
    instruction,
    query,
    asOf,
    maxFollowResults: 1,
    minSuccessfulSources: 1,
    maxQueryRewrites: 0,
    page: pageOptions,
  });
  assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
  const completed = z
    .object({
      instruction: z.string(),
      insufficient: z.boolean(),
      selected: z.array(z.object({ url: z.string() })),
      destinations: z.array(
        z.object({
          status: z.literal('completed'),
          value: z
            .object({
              status: z.literal('ready'),
              usable: z.literal(true),
              artifact: z.json(),
              trial: z.json(),
              execution: z
                .object({
                  status: z.literal('completed'),
                  value: z.object({ data: z.json() }).loose(),
                })
                .loose(),
            })
            .loose(),
        }),
      ),
    })
    .parse(outcome.value);
  assert.equal(completed.instruction, instruction);
  assert.equal(completed.insufficient, false);
  assert.deepEqual(completed.selected, [{ url: destination }]);
  assert.equal(completed.destinations.length, 1);
  const destinationResult = completed.destinations[0]?.value;
  assert(destinationResult);
  assert.deepEqual(destinationResult.execution, destinationResult.trial);
  assert.deepEqual(destinationResult.execution.value.data, ['First', 'Second']);
  assert.equal(
    gets.filter((url) => url === destination).length,
    2,
    'Destination acquisition plus final fresh trial; search must not execute a third time',
  );
  assert.equal(gets.length, 3, 'First search page is acquired once');

  names = ['Changed', 'Added', 'Third'];
  const beforeModels = calls.length;
  const replay = await (
    await prepareArtifact(destinationResult.artifact, mechanical, discoveryProfile.engine)
  ).run({ url: destination });
  assert.equal(replay.status, 'completed', JSON.stringify(replay));
  assert.deepEqual(z.object({ data: z.json() }).parse(replay.value).data, names);
  assert.equal(calls.length, beforeModels);
  assert.equal(gets.length, 4);
  console.log(
    '[pass] controlled-model search integration: original instruction/time/ceilings, no duplicate execution, AI-free changed-data replay',
  );
} finally {
  search.close();
  host.close();
}
