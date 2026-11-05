import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { z } from 'zod';
import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import { prepareArtifact, defineOperation } from '../src/index.js';
import { createSearchOperations, searchWorkflow, searchProfile } from '../src/search/index.js';
import { createModelOperation } from '../src/discovery/model.js';
import { RankingOutputSchema } from '../src/search/ranking.js';
import { discoveryProfile } from '../src/discovery/index.js';

const requests: string[] = [],
  discovered: string[] = [];
const destinationOptions: Array<{
  allowLinkFollowing: boolean;
  linkDepth: number;
  maxPages?: number;
}> = [];
let origin = '',
  changed = false;
const page = (count: number): string =>
  Array.from(
    { length: count },
    (_, index) =>
      `<div class="result"><a class="result__a" href="/wrap?uddg=${encodeURIComponent(origin + '/item-' + index)}">Item ${index}</a><p class="result__snippet">Candidate ${index}</p></div>`,
  ).join('');
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', origin);
  requests.push(url.pathname + url.search);
  response.setHeader('content-type', 'text/html');
  if (url.pathname === '/search') {
    const query = url.searchParams.get('q');
    if (query === 'empty') response.end('<div class="no-results">No results</div>');
    else if (query === 'blocked') {
      response.statusCode = 202;
      response.end('<form id="challenge-form">Challenge</form>');
    } else if (query === 'direct')
      response.end(
        `<div class="result"><a class="result__a" href="${origin}/item-0?uddg=${encodeURIComponent(origin + '/keep-this-parameter')}">Direct destination</a></div>`,
      );
    else response.end(page(query === 'sparse' ? 1 : 6));
  } else response.end(`<article>${changed ? 'Changed' : 'Original'} ${url.pathname}</article>`);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
origin = 'http://127.0.0.1:' + address.port;
const profile = {
  ...searchProfile,
  provider: {
    ...searchProfile.provider,
    endpoint: origin + '/search',
    wrapper: { origin, pathname: '/wrap' },
  },
};
const search = createSearchOperations({
  author: { apiKey: 'offline' },
  searchProfile: profile,
});
const artifact = {
  stamp: { 'eden.engine': 0, 'nisc.prism': 2 },
  flow: {
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    steps: [
      {
        id: 'page',
        call: { operation: 'http.get' },
        input: { url: { $ref: '$.input.url' }, headers: {} },
      },
      {
        id: 'items',
        call: { operation: 'html.select' },
        input: { source: { $ref: '$.steps.page.value' }, selector: 'article' },
      },
    ],
    output: {
      pages: [{ url: { $ref: '$.input.url' }, items: { $ref: '$.steps.items.value.items' } }],
    },
  },
};
let rankingCalls = 0,
  rewrites = 0,
  unavailable = false;
const operations = {
  ...search.operations,
  'artifact.trial': defineOperation({
    input: z.json(),
    output: z.json(),
    run() {
      throw new Error('Search must reuse the completed discovery trial');
    },
  }),
  'search.rank': defineOperation({
    input: z.object({ messages: z.array(z.object({ content: z.string() })) }).passthrough(),
    output: z.json(),
    run(input) {
      rankingCalls++;
      const message = input.messages[0];
      assert(message);
      const state = z
        .object({
          results: z.array(z.object({ id: z.string() }).passthrough()),
          maxResults: z.number(),
        })
        .passthrough()
        .parse(JSON.parse(message.content));
      return {
        ok: true,
        decision: { rankedIds: state.results.slice(0, state.maxResults).map((item) => item.id) },
        error: null,
        meta: { steps: 1 },
      };
    },
  }),
  'search.rewrite': defineOperation({
    input: z.json(),
    output: z.json(),
    run() {
      rewrites++;
      return { ok: true, decision: { query: 'good' }, error: null, meta: { steps: 1 } };
    },
  }),
  'test.discover': defineOperation({
    input: z
      .object({
        url: z.string(),
        instruction: z.string(),
        allowLinkFollowing: z.boolean(),
        linkDepth: z.number().int().nonnegative(),
        maxPages: z.number().int().positive().optional(),
      })
      .passthrough(),
    output: z.json(),
    async run(input) {
      assert.equal(input.instruction, 'Return matching entries.');
      discovered.push(input.url);
      destinationOptions.push({
        allowLinkFollowing: input.allowLinkFollowing,
        linkDepth: input.linkDepth,
        ...(input.maxPages === undefined ? {} : { maxPages: input.maxPages }),
      });
      if (unavailable)
        return {
          artifact: null,
          status: 'unresolved',
          trial: { status: 'failed', value: null, error: { code: 'SAVED_FAILURE' } },
        };
      const prepared = await prepareArtifact(artifact, search.operations, search.limits);
      return {
        artifact,
        status: 'ready',
        trial: await prepared.run({ url: input.url }),
      };
    },
  }),
};
const workflow = {
  ...searchWorkflow,
  flows: searchWorkflow.flows.map((entry) =>
    entry.id === 'search-page-discovery'
      ? {
          ...entry,
          flow: {
            inputSchema: { type: 'object' },
            outputSchema: {},
            steps: [
              { id: 'discover', call: { operation: 'test.discover' }, input: { $ref: '$.input' } },
            ],
            output: { $ref: '$.steps.discover.value' },
          },
        }
      : entry,
  ),
};
const resultSchema = z
  .object({
    selected: z.array(z.object({ url: z.string() }).passthrough()),
    insufficient: z.boolean(),
    attempts: z.array(z.unknown()),
    destinations: z.array(
      z
        .object({
          status: z.string(),
          value: z
            .object({
              artifact: z.unknown(),
              trial: z.json(),
              execution: z
                .object({
                  status: z.string(),
                  value: z.object({
                    pages: z.array(
                      z
                        .object({ items: z.array(z.object({ text: z.string() }).passthrough()) })
                        .passthrough(),
                    ),
                  }),
                })
                .passthrough()
                .nullable(),
            })
            .nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
try {
  const prepared = await prepareArtifact(workflow, operations, search.limits);
  const outcome = await prepared.run({
    instruction: 'Return matching entries.',
    query: 'good',
    maxFollowResults: 6,
    minSuccessfulSources: 6,
  });
  assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
  const data = resultSchema.parse(outcome.value);
  assert.equal(data.selected.length, 6);
  assert.equal(discovered.length, 6);
  assert(
    destinationOptions.every((options) => options.allowLinkFollowing && options.linkDepth === 1),
  );
  assert.equal(
    data.destinations.filter((entry) => entry.value?.execution?.status === 'completed').length,
    6,
  );
  for (const entry of data.destinations) {
    assert(entry.value);
    assert.deepEqual(entry.value.execution, entry.value.trial);
  }
  for (const url of discovered) {
    const target = new URL(url);
    assert.equal(
      requests.filter((request) => request === target.pathname + target.search).length,
      1,
    );
  }
  assert(requests.every((request) => !request.includes('page=')));
  const before = rankingCalls;
  changed = true;
  const mechanical = await prepareArtifact(artifact, search.operations, search.limits);
  const replay = await mechanical.run({ url: origin + '/item-0' });
  assert.equal(replay.status, 'completed');
  assert(
    z
      .object({
        pages: z.array(
          z.object({ items: z.array(z.object({ text: z.string() }).passthrough()) }).passthrough(),
        ),
      })
      .parse(replay.value)
      .pages[0]?.items[0]?.text.includes('Changed'),
  );
  assert.equal(rankingCalls, before);
  console.log(
    '[pass] search: completed discovery trials supply execution data without a second fetch; six destinations and AI-free changed-value replay supported',
  );

  unavailable = true;
  try {
    const unresolved = await prepared.run({
      instruction: 'Return matching entries.',
      query: 'good',
      maxFollowResults: 1,
      minSuccessfulSources: 1,
    });
    assert.equal(unresolved.status, 'completed');
    const entry = resultSchema.parse(unresolved.value).destinations[0];
    assert(entry?.value);
    assert.equal(entry.value.artifact, null);
    assert.equal(entry.value.execution, null);
  } finally {
    unavailable = false;
  }

  const disabled = await prepared.run({
    instruction: 'Return matching entries.',
    query: 'good',
    maxFollowResults: 1,
    minSuccessfulSources: 1,
    page: { allowLinkFollowing: false, linkDepth: 0, maxPages: 2 },
  });
  assert.equal(disabled.status, 'completed');
  assert.deepEqual(destinationOptions.at(-1), {
    allowLinkFollowing: false,
    linkDepth: 0,
    maxPages: 2,
  });
  const configured = createSearchOperations({
    author: { apiKey: 'offline' },
    searchProfile: { ...profile, pageDefaults: { allowLinkFollowing: true, linkDepth: 4 } },
  });
  try {
    const configuredProfile = configured.operations['search.profile'];
    assert(configuredProfile);
    const custom = await prepareArtifact(
      workflow,
      { ...operations, 'search.profile': configuredProfile },
      configured.limits,
    );
    const deeper = await custom.run({
      instruction: 'Return matching entries.',
      query: 'good',
      maxFollowResults: 1,
      minSuccessfulSources: 1,
    });
    assert.equal(deeper.status, 'completed');
    assert.equal(destinationOptions.at(-1)?.linkDepth, 4);
    const overridden = await custom.run({
      instruction: 'Return matching entries.',
      query: 'good',
      maxFollowResults: 1,
      minSuccessfulSources: 1,
      page: { linkDepth: 2 },
    });
    assert.equal(overridden.status, 'completed');
    assert.deepEqual(destinationOptions.at(-1), {
      allowLinkFollowing: true,
      linkDepth: 2,
      maxPages: discoveryProfile.traversal.maxPages,
    });
  } finally {
    configured.close();
  }
  console.log(
    '[pass] search: every destination receives its full profile depth; caller disabling/partial overrides win, with no search-hop deduction',
  );

  const sparse = await prepared.run({
    instruction: 'Return matching entries.',
    query: 'sparse',
    maxFollowResults: 2,
    minSuccessfulSources: 2,
    maxQueryRewrites: 1,
  });
  assert.equal(sparse.status, 'completed', JSON.stringify(sparse));
  const retry = resultSchema.parse(sparse.value);
  assert.equal(retry.attempts.length, 2);
  assert.equal(retry.selected.length, 2);
  assert.equal(rewrites, 1);
  console.log(
    '[pass] search: bounded query rewriting, shared result cap and duplicate destination removal',
  );

  const emptyBefore = rankingCalls;
  const emptyHttpBefore = requests.length;
  const empty = await prepared.run({
    instruction: 'Return matching entries.',
    query: 'empty',
    minSuccessfulSources: 1,
    maxQueryRewrites: 0,
  });
  assert.equal(empty.status, 'completed', JSON.stringify(empty));
  assert.equal(resultSchema.parse(empty.value).selected.length, 0);
  assert.equal(resultSchema.parse(empty.value).insufficient, true);
  assert.equal(requests.length, emptyHttpBefore + 1);
  assert.equal(rankingCalls, emptyBefore);
  const blocked = await prepared.run({ instruction: 'Return matching entries.', query: 'blocked' });
  assert.equal(blocked.status, 'failed');
  assert.equal(blocked.error?.code, 'SEARCH_ACQUISITION_BLOCKED');
  const invalidBefore = requests.length;
  const invalid = await prepared.run({
    instruction: 'Return matching entries.',
    minSuccessfulSources: 8,
    maxFollowResults: 2,
  });
  assert.equal(invalid.status, 'failed');
  assert.equal(requests.length, invalidBefore);
  console.log(
    '[pass] search: genuine empty results, blocked acquisition and impossible bounds remain distinct',
  );

  const build = search.operations['url.build'],
    parse = search.operations['url.parse'];
  assert(build && parse);
  const encoded = await build.run(
    {
      url: origin + '/?old=1&q=old',
      parameters: [
        { name: 'q', value: 'Wien ü & AI' },
        { name: 'q', value: 'second' },
      ],
    },
    { signal: AbortSignal.timeout(1000) },
  );
  const parsed = z
    .object({ parameters: z.array(z.object({ name: z.string(), value: z.string() })) })
    .passthrough()
    .parse(await parse.run({ url: encoded }, { signal: AbortSignal.timeout(1000) }));
  assert.deepEqual(parsed.parameters, [
    { name: 'old', value: '1' },
    { name: 'q', value: 'Wien ü & AI' },
    { name: 'q', value: 'second' },
  ]);
  console.log(
    '[pass] URL mechanics: encoded Unicode and repeated query parameters round-trip without provider policy',
  );

  const direct = await prepared.run({
    instruction: 'Return matching entries.',
    query: 'direct',
    maxFollowResults: 1,
    minSuccessfulSources: 1,
  });
  assert.equal(direct.status, 'completed', JSON.stringify(direct));
  assert.equal(
    resultSchema.parse(direct.value).selected[0]?.url,
    origin + '/item-0?uddg=' + encodeURIComponent(origin + '/keep-this-parameter'),
  );
  const recovered = createSearchOperations({
    author: { apiKey: 'offline' },
    searchProfile: profile,
    recoverSearch: defineOperation({
      input: z.json(),
      output: z.json(),
      run(_input, context) {
        const get = search.operations['http.get'];
        assert(get);
        return get.run({ url: origin + '/unknown', headers: {} }, context);
      },
    }),
  });
  try {
    const recovering = await prepareArtifact(
      searchWorkflow,
      recovered.operations,
      recovered.limits,
    );
    const failed = await recovering.run({
      instruction: 'Return matching entries.',
      query: 'blocked',
    });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error?.code, 'CHECK_FAILED');
  } finally {
    recovered.close();
  }
  console.log(
    '[pass] search: direct destination parameters survive; recovery cannot turn an unknown page into empty results',
  );

  const referenceTime = '2026-10-31T18:00:00+01:00';
  let modelCalls = 0;
  const ranking = createModelOperation(RankingOutputSchema, {
    client: createSignal('groq', {
      apiKey: 'offline',
      client: new OpenAI({
        apiKey: 'offline',
        fetch: async (_url: unknown, init?: RequestInit) => {
          modelCalls++;
          assert(typeof init?.body === 'string');
          const request = z
            .object({ messages: z.array(z.object({ content: z.string() }).passthrough()) })
            .passthrough()
            .parse(JSON.parse(init.body));
          const message = request.messages.find((entry) => entry.content.includes('"maxResults"'));
          assert(message);
          const context = z
            .object({
              instruction: z.string(),
              asOf: z.string(),
              results: z.array(z.object({ id: z.string() }).passthrough()),
              maxResults: z.number(),
            })
            .passthrough()
            .parse(JSON.parse(message.content));
          assert.equal(context.asOf, referenceTime);
          assert.equal(context.instruction, 'Original request');
          assert.deepEqual(
            context.results.map((result) => result.id),
            ['a', 'b'],
          );
          assert.equal(context.maxResults, 2);
          const data = modelCalls === 1 ? { rankedIds: 42 } : { rankedIds: ['b', 'a'] };
          return new Response(
            'data: ' +
              JSON.stringify({
                id: 'fixture',
                choices: [
                  { index: 0, delta: { content: JSON.stringify({ data }) }, finish_reason: 'stop' },
                ],
              }) +
              '\n\ndata: [DONE]\n\n',
            { headers: { 'content-type': 'text/event-stream' } },
          );
        },
      }),
    }),
    maxJsonDepth: search.limits.maxJsonDepth,
  });
  const response = await ranking.run(
    {
      instructions: profile.ranking.instructions,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            instruction: 'Original request',
            query: 'query',
            asOf: referenceTime,
            results: ['a', 'b'].map((id) => ({
              id,
              title: id,
              description: '',
              url: origin + '/' + id,
            })),
            maxResults: 2,
            perDestination: {},
            observations: [],
          }),
        },
      ],
      settings: { ...profile.ranking.settings, maxMs: 10000 },
      maxInputBytes: profile.maxInputBytes,
    },
    { signal: AbortSignal.timeout(10000) },
  );
  assert.equal(modelCalls, 2);
  assert.deepEqual(
    z
      .object({ ok: z.literal(true), decision: RankingOutputSchema })
      .passthrough()
      .parse(response).decision.rankedIds,
    ['b', 'a'],
  );
  console.log(
    '[pass] search ranking: shared metadata and caller time reach Cortex; Cortex repairs malformed JSON output and preserves emitted order',
  );
} finally {
  search.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
