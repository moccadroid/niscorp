import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineOperation, prepareArtifact } from '../src/index.js';
import { OperationFailure, RunControl } from '../src/engine/control.js';
import type { JsonValue } from '../src/engine/contracts.js';
import { createSearchOperations, searchWorkflow, searchProfile } from '../src/search/index.js';
import { discoveryProfile } from '../src/discovery/index.js';
import { HtmlSelectorError } from '../src/readers/html/index.js';
import saved from './fixtures/search/saved-outcomes.json' with { type: 'json' };

// Real saved destination outcomes, with controlled ranking and rewrite answers.
// These checks prove orchestration, not new model accuracy.
const sourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
});
type Source = z.infer<typeof sourceSchema>;
const candidates = z.array(sourceSchema).parse(saved.candidates);
for (const provider of [
  { ...searchProfile.provider, selector: '[' },
  { ...searchProfile.provider, emptySelector: ':nth-child(nope)' },
  {
    ...searchProfile.provider,
    fields: {
      ...searchProfile.provider.fields,
      title: { ...searchProfile.provider.fields.title!, selector: '[' },
    },
  },
  {
    ...searchProfile.provider,
    fields: {
      ...searchProfile.provider.fields,
      title: { ...searchProfile.provider.fields.title!, closest: '[' },
    },
  },
  ...['> section', '+ article'].map((closest) => ({
    ...searchProfile.provider,
    fields: {
      ...searchProfile.provider.fields,
      title: { ...searchProfile.provider.fields.title!, closest },
    },
  })),
]) {
  assert.throws(
    () =>
      createSearchOperations({
        author: { apiKey: 'unused-offline' },
        searchProfile: { ...searchProfile, provider },
      }),
    HtmlSelectorError,
  );
}
for (const selector of [':scope > a', '> a']) {
  const customSearch = createSearchOperations({
    author: { apiKey: 'unused-offline' },
    searchProfile: {
      ...searchProfile,
      provider: {
        ...searchProfile.provider,
        fields: {
          ...searchProfile.provider.fields,
          title: {
            ...searchProfile.provider.fields.title!,
            selector,
            closest: 'div.result:has(a)',
          },
        },
      },
    },
  });
  customSearch.close();
}
console.log(
  '[pass] search profile admission: invalid provider/empty/field/closest CSS fails before acquisition; supported scoped CSS remains valid',
);
// The historical fixture is unchanged; adapt its old status to the current public contract.
const success = {
  ...z.record(z.string(), z.json()).parse(saved.successful.value),
  status: 'ready',
};
const successfulSource = sourceSchema.parse(saved.successful.value.source);
const failures = new Map(
  saved.failures.map((entry) => [entry.value.source.url, z.json().parse(entry.value)]),
);
const failedSources = candidates.filter((source) => failures.has(source.url));
const first = candidates[0];
assert(first);
const outputSchema = z
  .object({
    attempts: z.array(z.json()),
    selected: z.array(sourceSchema.passthrough()),
    successfulSources: z.number(),
    insufficient: z.boolean(),
    destinations: z.array(
      z.object({ status: z.string(), value: z.json(), error: z.json() }).passthrough(),
    ),
  })
  .passthrough();
const requestSchema = z
  .object({ messages: z.array(z.object({ content: z.string() })) })
  .passthrough();
const rankingContextSchema = z
  .object({
    instruction: z.string(),
    query: z.string(),
    asOf: z.string().nullable(),
    results: z.array(sourceSchema),
    maxResults: z.number().int().positive(),
    perDestination: z.object({}).passthrough(),
    observations: z.array(z.json()),
  })
  .strict();
const feedbackSchema = z
  .object({
    instruction: z.string(),
    observations: z.array(
      z
        .object({ url: z.string(), usable: z.boolean(), error: z.json(), feedback: z.json() })
        .passthrough(),
    ),
  })
  .passthrough();

const pageShape = {
  allowLinkFollowing: z.boolean(),
  linkDepth: z.number(),
  maxPages: z.number(),
  allowResourceFetching: z.boolean(),
  maxResources: z.number(),
};

const search = createSearchOperations({
  author: { apiKey: 'offline' },
});
let queries: string[] = [],
  visits: string[] = [],
  rewriteInputs: z.infer<typeof feedbackSchema>[] = [],
  pageInputs: JsonValue[] = [],
  responses: Array<string | null> = [],
  pages = new Map<string, Source[]>(),
  outcomes = new Map<string, JsonValue>(),
  failVisit: string | null = null,
  failSearch = false,
  fatalVisit = false;
let continuationFailure:
  'rewrite' | 'search' | 'ranking' | 'cancel' | 'fatal' | 'resource' | 'integrity' | null = null;
let rankOverrides = new Map<string, string[]>();
let rankingInputs: z.infer<typeof rankingContextSchema>[] = [];
let failRanking = false;
let controller: AbortController | null = null;
let continuationController: AbortController | null = null;
const operations = {
  ...search.operations,
  'test.search': defineOperation({
    input: z.object({ query: z.string() }).passthrough(),
    output: z.json(),
    run(input) {
      queries.push(input.query);
      if (input.query === 'alternative' && continuationFailure === 'search')
        throw new OperationFailure(
          'SEARCH_ACQUISITION_BLOCKED',
          'Controlled continuation challenge',
        );
      if (failSearch) throw new OperationFailure('SEARCH_ACQUISITION_BLOCKED', 'Fixture challenge');
      return { query: input.query, results: pages.get(input.query) ?? [] };
    },
  }),
  'search.rank': defineOperation({
    input: requestSchema,
    output: z.json(),
    run(input) {
      const message = input.messages[0];
      assert(message);
      const state = rankingContextSchema.parse(JSON.parse(message.content));
      rankingInputs.push(state);
      return {
        ok: !failRanking && !(state.query === 'alternative' && continuationFailure === 'ranking'),
        decision:
          failRanking || (state.query === 'alternative' && continuationFailure === 'ranking')
            ? null
            : {
                rankedIds:
                  rankOverrides.get(state.query) ??
                  state.results.slice(0, state.maxResults).map((source) => source.id),
              },
        error: failRanking ? { code: 'MODEL_FAILED' } : null,
        meta: { steps: 1 },
      };
    },
  }),
  'search.rewrite': defineOperation({
    input: requestSchema,
    output: z.json(),
    run(input) {
      const message = input.messages[0];
      assert(message);
      rewriteInputs.push(feedbackSchema.parse(JSON.parse(message.content)));
      if (continuationFailure === 'cancel') continuationController?.abort();
      if (continuationFailure === 'fatal')
        throw new Error('Controlled continuation evidence failure');
      if (continuationFailure === 'resource')
        throw new RunControl('ITEMS', 'Controlled continuation resource failure');
      if (continuationFailure === 'integrity')
        throw new RunControl('SOURCE_INTEGRITY', 'Controlled continuation integrity failure');
      assert(responses.length > 0, 'Unexpected additional rewrite');
      return {
        ok: continuationFailure !== 'rewrite',
        decision: continuationFailure === 'rewrite' ? null : { query: responses.shift() ?? null },
        error:
          continuationFailure === 'rewrite'
            ? { code: 'MODEL_FAILED', message: 'Controlled rewrite failure' }
            : null,
        meta: { steps: 1, elapsedMs: 1, outputRetries: 0 },
      };
    },
  }),
  'test.destination': defineOperation({
    input: z.object({ url: z.string(), instruction: z.string() }).passthrough(),
    output: z.json(),
    run(input) {
      assert.equal(input.instruction, saved.instruction);
      visits.push(input.url);
      pageInputs.push(z.json().parse(input));
      if (controller) controller.abort();
      if (fatalVisit) throw new Error('Evidence observer failed');
      if (input.url === failVisit)
        throw new OperationFailure('HTTP_STATUS', 'Fixture HTTP failure');
      const outcome = outcomes.get(input.url);
      assert(outcome, 'Missing saved outcome: ' + input.url);
      return outcome;
    },
  }),
};
const substitute = (operation: string) => ({
  inputSchema: { type: 'object' },
  outputSchema: {},
  steps: [{ id: 'fixture', call: { operation }, input: { $ref: '$.input' } }],
  output: { $ref: '$.steps.fixture.value' },
});
const workflow = {
  ...searchWorkflow,
  flows: searchWorkflow.flows.map((entry) =>
    entry.id === 'search-page'
      ? { ...entry, flow: substitute('test.search') }
      : entry.id === 'search-page-discovery'
        ? { ...entry, flow: substitute('test.destination') }
        : entry,
  ),
};
let checks = 0;
const reset = (): void => {
  queries = [];
  visits = [];
  rewriteInputs = [];
  pageInputs = [];
  responses = [];
  pages = new Map([['initial', failedSources]]);
  rankOverrides = new Map();
  rankingInputs = [];
  failRanking = false;
  outcomes = new Map(failures);
  outcomes.set(successfulSource.url, success);
  failVisit = null;
  failSearch = false;
  fatalVisit = false;
  controller = null;
  continuationFailure = null;
  continuationController = null;
};
try {
  const prepared = await prepareArtifact(workflow, operations, search.limits);
  const run = async (options: Record<string, JsonValue> = {}) => {
    const result = await prepared.run({
      instruction: saved.instruction,
      query: 'initial',
      maxFollowResults: 5,
      minSuccessfulSources: 1,
      maxQueryRewrites: 0,
      ...options,
    });
    assert.equal(result.status, 'completed', JSON.stringify(result));
    const output = outputSchema.parse(result.value);
    assert.equal(output.destinations.length, output.selected.length);
    return output;
  };
  const check = async (name: string, body: () => Promise<void>) => {
    reset();
    await body();
    checks++;
    console.log('[pass] bounded search: ' + name);
  };

  await check(
    'all five saved failures: five slots consumed, zero usable sources, insufficient true',
    async () => {
      const result = await run();
      assert.equal(result.successfulSources, 0);
      assert.equal(result.insufficient, true);
      assert.deepEqual(
        visits,
        failedSources.map((source) => source.url),
      );
      assert.equal(rewriteInputs.length, 0);
      assert.equal(result.destinations.length, 5);
    },
  );
  await check('rewrite runs after the retained queue is exhausted', async () => {
    pages.set('initial', [first]);
    responses = ['alternative'];
    pages.set('alternative', [successfulSource]);
    const result = await run({ maxQueryRewrites: 1 });
    assert.deepEqual(visits, [first.url, successfulSource.url]);
    assert.equal(result.successfulSources, 1);
    assert.equal(result.insufficient, false);
    assert.equal(queries.length, 2);
    assert.equal(rewriteInputs.length, 1);
    const returned = z
      .object({ artifact: z.json(), execution: z.json(), usable: z.boolean() })
      .parse(result.destinations[1]?.value);
    assert.deepEqual(returned.artifact, saved.successful.value.artifact);
    assert.deepEqual(returned.execution, saved.successful.value.execution);
    assert.equal(returned.usable, true);
    assert.equal(rewriteInputs[0]?.observations[0]?.usable, false);
    assert.equal(rewriteInputs[0]?.instruction, saved.instruction);
    assert(!JSON.stringify(rewriteInputs).includes('"artifact"'));
  });
  await check('reaching the minimum still visits retained sources without rewriting', async () => {
    const fallback = first;
    pages.set('initial', [successfulSource, fallback]);
    const result = await run({ maxQueryRewrites: 1 });
    assert.equal(result.successfulSources, 1);
    assert.deepEqual(visits, [successfulSource.url, fallback.url]);
    assert.equal(rewriteInputs.length, 0);
  });
  await check(
    'model order controls visits and omitted candidates never become fallback',
    async () => {
      const second = failedSources[1],
        third = failedSources[2];
      assert(second && third);
      rankOverrides.set('initial', [third.id, first.id]);
      const result = await run();
      assert.deepEqual(visits, [third.url, first.url]);
      assert.equal(result.destinations.length, 2);
      assert.equal(rankingInputs.length, 1);
      assert.deepEqual(
        z
          .object({ rankedIds: z.array(z.string()) })
          .passthrough()
          .parse(result.attempts[0]).rankedIds,
        [third.id, first.id],
      );
    },
  );
  await check('the default permits five visits and passes only metadata to ranking', async () => {
    pages.set('initial', [...failedSources, { ...first, id: 'extra', url: first.url + '?extra' }]);
    const result = await prepared.run({
      instruction: saved.instruction,
      query: 'initial',
      maxQueryRewrites: 0,
    });
    assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.equal(outputSchema.parse(result.value).selected.length, 5);
    assert.equal(rankingInputs[0]?.maxResults, 5);
    assert.equal(rankingInputs[0]?.results.length, 6);
    assert.equal(rankingInputs.length, 1);
    assert.deepEqual(rankingInputs[0]?.perDestination, {
      ...searchProfile.pageDefaults,
      maxPages: discoveryProfile.traversal.maxPages,
      allowResourceFetching: discoveryProfile.resources.allowResourceFetching,
      maxResources: discoveryProfile.resources.maxResources,
    });
    assert(!JSON.stringify(rankingInputs).includes('"artifact"'));
    assert(!JSON.stringify(rankingInputs).includes('"html"'));
  });
  await check('duplicate target URLs are removed before ranking', async () => {
    pages.set('initial', [first, { ...first, id: 'duplicate' }]);
    await run();
    assert.deepEqual(visits, [first.url]);
    assert.equal(rankingInputs[0]?.results.length, 1);
  });
  await check(
    'ranking and discovery receive effective configured page/resource limits',
    async () => {
      const configured = createSearchOperations({
        author: { apiKey: 'offline' },
        profile: {
          ...discoveryProfile,
          traversal: { ...discoveryProfile.traversal, maxPages: 7 },
          resources: { ...discoveryProfile.resources, maxResources: 9 },
        },
        searchProfile: {
          ...searchProfile,
          pageDefaults: { allowLinkFollowing: false, linkDepth: 0 },
        },
      });
      try {
        const profile = configured.operations['search.profile'];
        const pageProfile = configured.operations['discovery.profile'];
        assert(profile && pageProfile);
        const prepared = await prepareArtifact(
          workflow,
          {
            ...operations,
            'search.profile': profile,
            'discovery.profile': pageProfile,
          },
          configured.limits,
        );
        const result = await prepared.run({
          instruction: saved.instruction,
          query: 'initial',
          maxFollowResults: 1,
          minSuccessfulSources: 0,
          maxQueryRewrites: 0,
        });
        assert.equal(result.status, 'completed', JSON.stringify(result));
        const expected = {
          allowLinkFollowing: false,
          linkDepth: 0,
          maxPages: 7,
          allowResourceFetching: false,
          maxResources: 9,
        };
        assert.deepEqual(rankingInputs[0]?.perDestination, expected);
        assert.deepEqual(z.object(pageShape).parse(pageInputs[0]), expected);
      } finally {
        configured.close();
      }
    },
  );
  await check(
    'empty ranked answer visits nothing and does not fall back to raw results',
    async () => {
      rankOverrides.set('initial', []);
      const result = await run();
      assert.equal(result.insufficient, true);
      assert.equal(visits.length, 0);
      assert.equal(rankingInputs.length, 1);
    },
  );
  await check(
    'unknown, duplicate and over-limit IDs fail before any destination work',
    async () => {
      const second = failedSources[1];
      assert(second);
      for (const rankedIds of [['not-supplied'], [first.id, first.id], [first.id, second.id]]) {
        rankOverrides.set('initial', rankedIds);
        const result = await prepared.run({
          instruction: saved.instruction,
          query: 'initial',
          maxFollowResults: 1,
          minSuccessfulSources: 1,
          maxQueryRewrites: 0,
        });
        assert.equal(result.status, 'failed', JSON.stringify(result));
        assert.equal(visits.length, 0);
      }
    },
  );
  await check(
    'caller reference time reaches selection, rewrite and destination unchanged',
    async () => {
      const asOf = '2026-10-31T18:00:00+01:00';
      pages.set('initial', [first]);
      pages.set('alternative', [successfulSource]);
      responses = ['alternative'];
      await run({ asOf, maxQueryRewrites: 1 });
      for (const value of [...rankingInputs, ...rewriteInputs, ...pageInputs]) {
        assert.equal(z.object({ asOf: z.string() }).passthrough().parse(value).asOf, asOf);
      }
    },
  );
  await check('null rewrite ends the exhausted queue without inventing candidates', async () => {
    pages.set('initial', [first]);
    responses = [null];
    const result = await run({ maxFollowResults: 3, maxQueryRewrites: 1 });
    assert.equal(result.insufficient, true);
    assert.equal(visits.length, 1);
    assert.equal(rewriteInputs.length, 1);
    assert.equal(queries.length, 1);
  });
  await check('rewritten duplicate is skipped before fresh candidates are visited', async () => {
    pages.set('initial', [first]);
    responses = ['alternative'];
    pages.set('alternative', [first, ...failedSources.slice(1, 3)]);
    const result = await run({ maxFollowResults: 3, maxQueryRewrites: 1 });
    assert.deepEqual(visits, [first.url, failedSources[1]?.url, failedSources[2]?.url]);
    assert.equal(result.destinations.length, 3);
    assert.equal(new Set(visits).size, 3);
    assert.equal(rankingInputs.length, 2);
    assert.equal(rankingInputs[1]?.maxResults, 2);
    assert(!rankingInputs[1]?.results.some((source) => source.url === first.url));
  });
  await check('two rewrites share the same bounds through an empty query round', async () => {
    pages.set('initial', [first]);
    pages.set('empty', []);
    pages.set('alternative', [successfulSource]);
    responses = ['empty', 'alternative'];
    const result = await run({ maxQueryRewrites: 2 });
    assert.equal(result.successfulSources, 1);
    assert.equal(rewriteInputs.length, 2);
    assert.deepEqual(queries, ['initial', 'empty', 'alternative']);
    assert.deepEqual(visits, [first.url, successfulSource.url]);
  });
  await check('failed destination consumes last slot without a rewrite', async () => {
    failVisit = first.url;
    const result = await run({ maxFollowResults: 1, maxQueryRewrites: 2 });
    assert.equal(result.destinations[0]?.status, 'failed');
    assert.equal(result.insufficient, true);
    assert.equal(visits.length, 1);
    assert.equal(rewriteInputs.length, 0);
  });
  await check(
    'ordinary HTTP failure is forwarded to rewrite; caller page limits stay unchanged',
    async () => {
      pages.set('initial', [first]);
      failVisit = first.url;
      responses = ['alternative'];
      pages.set('alternative', [successfulSource]);
      const page = {
        allowLinkFollowing: false,
        linkDepth: 0,
        maxPages: 1,
        allowResourceFetching: false,
        maxResources: 0,
      };
      const result = await run({ maxQueryRewrites: 1, page });
      assert.equal(result.successfulSources, 1);
      assert.deepEqual(rankingInputs[0]?.perDestination, page);
      assert.deepEqual(rewriteInputs[0]?.observations[0]?.error, {
        code: 'HTTP_STATUS',
        message: 'Fixture HTTP failure',
      });
      for (const input of pageInputs)
        assert.deepEqual(z.object(pageShape).passthrough().parse(input), {
          ...page,
          url: visits[pageInputs.indexOf(input)],
          instruction: saved.instruction,
        });
    },
  );
  await check('partial successful output survives when minimum cannot be reached', async () => {
    pages.set('initial', [successfulSource, first]);
    const result = await run({ maxFollowResults: 2, minSuccessfulSources: 2 });
    assert.equal(result.successfulSources, 1);
    assert.equal(result.insufficient, true);
    assert.equal(result.destinations.length, 2);
  });
  for (const failure of ['rewrite', 'search', 'ranking', null] as const) {
    await check(
      `working artifact survives optional continuation: ${failure ?? 'successful control'}`,
      async () => {
        pages.set('initial', [successfulSource]);
        pages.set('alternative', [first]);
        responses = ['alternative'];
        continuationFailure = failure;
        const result = await run({
          minSuccessfulSources: 2,
          maxFollowResults: 3,
          maxQueryRewrites: 1,
        });
        assert.equal(result.successfulSources, 1);
        assert.equal(result.insufficient, true);
        assert(visits.length <= 3);
        assert.equal(rewriteInputs.length, 1);
        const retained = z
          .object({ artifact: z.json(), execution: z.json() })
          .parse(result.destinations[0]?.value);
        assert.deepEqual(retained.artifact, saved.successful.value.artifact);
        assert.deepEqual(retained.execution, saved.successful.value.execution);
        if (failure) {
          const error = z
            .object({
              phase: z.enum(['rewrite', 'search']),
              error: z.object({ code: z.string(), message: z.string() }),
            })
            .parse(result.continuationError);
          assert.equal(error.phase, failure === 'rewrite' ? 'rewrite' : 'search');
          assert.match(
            error.error.message,
            failure === 'search'
              ? /Controlled continuation challenge/
              : failure === 'rewrite'
                ? /SEARCH_REWRITE_FAILED/
                : /SEARCH_RANKING_FAILED/,
          );
          assert.equal(visits.length, 1);
        } else {
          assert.equal(result.continuationError, null);
          assert.deepEqual(visits, [successfulSource.url, first.url]);
        }
      },
    );
  }
  await check(
    'valid null continuation retains working artifact without reporting an error',
    async () => {
      pages.set('initial', [successfulSource]);
      responses = [null];
      const result = await run({
        minSuccessfulSources: 2,
        maxFollowResults: 3,
        maxQueryRewrites: 1,
      });
      assert.equal(result.successfulSources, 1);
      assert.equal(result.destinations.length, 1);
      assert.equal(result.continuationError, null);
      assert.equal(queries.length, 1);
    },
  );
  await check(
    'failed optional continuation without a working artifact stays a concrete failure',
    async () => {
      pages.set('initial', [first]);
      responses = ['alternative'];
      continuationFailure = 'rewrite';
      const result = await prepared.run({
        instruction: saved.instruction,
        query: 'initial',
        minSuccessfulSources: 2,
        maxFollowResults: 3,
        maxQueryRewrites: 1,
      });
      assert.equal(result.status, 'failed');
      assert.match(result.error?.message ?? '', /SEARCH_REWRITE_FAILED/);
    },
  );
  for (const failure of ['cancel', 'fatal', 'resource', 'integrity'] as const) {
    await check(`working artifact cannot suppress terminal continuation ${failure}`, async () => {
      pages.set('initial', [successfulSource]);
      responses = ['alternative'];
      continuationFailure = failure;
      const ownedController = new AbortController();
      continuationController = ownedController;
      await assert.rejects(
        prepared.run(
          {
            instruction: saved.instruction,
            query: 'initial',
            minSuccessfulSources: 2,
            maxFollowResults: 3,
            maxQueryRewrites: 1,
          },
          { signal: ownedController.signal },
        ),
        failure === 'cancel' ? /Run cancelled/ : /Controlled continuation/,
      );
      assert.equal(visits.length, 1);
    });
  }
  await check(
    'HTML empty selection is not success; shaped false and zero are valid outputs',
    async () => {
      const empty = {
        ...success,
        trial: { status: 'completed', error: null, value: { pages: [] } },
      };
      pages.set('initial', [first]);
      outcomes.set(first.url, empty);
      assert.equal((await run({ maxFollowResults: 1 })).successfulSources, 0);
      for (const value of [false, 0]) {
        outcomes.set(first.url, {
          ...success,
          trial: { status: 'completed', error: null, value: { data: value } },
        });
        assert.equal(
          (
            await run({
              maxFollowResults: 1,
              page: { outputSchema: { type: typeof value === 'boolean' ? 'boolean' : 'number' } },
            })
          ).successfulSources,
          1,
        );
      }
      outcomes.set(first.url, { ...empty, status: 'unresolved', artifact: null });
      assert.equal((await run({ maxFollowResults: 1 })).successfulSources, 0);
      outcomes.set(first.url, {
        ...success,
        trial: { status: 'completed', error: null, value: { data: [] } },
      });
      assert.equal((await run({ maxFollowResults: 1 })).successfulSources, 0);
      outcomes.set(first.url, {
        ...success,
        trial: {
          status: 'completed',
          error: null,
          value: {
            pages: [],
            resources: {
              items: [{ bytes: [37, 80, 68, 70] }],
              visited: [],
              limited: false,
              redirects: [],
            },
          },
        },
      });
      assert.equal((await run({ maxFollowResults: 1 })).successfulSources, 1);
      outcomes.set(first.url, {
        ...success,
        trial: {
          status: 'completed',
          error: null,
          value: { data: [], resources: { items: [], visited: [], limited: false, redirects: [] } },
        },
      });
      assert.equal((await run({ maxFollowResults: 1 })).successfulSources, 0);
      outcomes.set(first.url, {
        ...success,
        trial: { status: 'failed', value: null, error: { code: 'CHECK_FAILED' } },
      });
      assert.equal((await run({ maxFollowResults: 1 })).successfulSources, 0);
      outcomes.set(first.url, { ...success, status: 'validated' });
      assert.equal(
        (await run({ maxFollowResults: 1 })).successfulSources,
        0,
        'An unpublished status cannot replace a ready artifact',
      );
    },
  );
  await check('a ready artifact remains usable with a visible negative review', async () => {
    const decision = { accepted: false, reason: 'Caller-visible semantic warning.' };
    outcomes.set(first.url, { ...success, review: { ok: true, decision, error: null } });
    pages.set('initial', [first]);
    const result = await run({ maxFollowResults: 1 });
    assert.equal(result.successfulSources, 1);
    const destination = z
      .object({ feedback: z.object({ review: z.json() }), execution: z.json() })
      .loose()
      .parse(result.destinations[0]?.value);
    assert.deepEqual(destination.feedback.review, decision);
    assert(destination.execution);
  });
  await check(
    'feedback projects review and trial errors without source or artifact bodies',
    async () => {
      const decision = {
        accepted: false,
        reason: 'Selected records do not satisfy the instruction.',
      };
      const error = { code: 'RECORD_FIELD', message: 'Required record field missing' };
      outcomes.set(first.url, {
        artifact: null,
        status: 'unresolved',
        reason: decision.reason,
        trial: null,
        review: { decision, error: null },
        partialTrial: {
          outputSchema: { type: 'array' },
          outcome: { status: 'completed', error: null, value: 'DO_NOT_FORWARD' },
        },
        levels: [
          {
            depth: 0,
            format: 'html',
            ready: false,
            sources: ['DO_NOT_FORWARD'],
            trials: [{ id: 'mechanical', status: 'failed', error, value: 'DO_NOT_FORWARD' }],
          },
        ],
      });
      responses = [null];
      pages.set('initial', [first]);
      await run({ maxQueryRewrites: 1, maxFollowResults: 2 });
      assert.deepEqual(rewriteInputs[0]?.observations[0]?.feedback, {
        status: 'unresolved',
        reason: decision.reason,
        trialError: null,
        review: decision,
        partialTrial: { status: 'completed', error: null },
      });
      assert(!JSON.stringify(rewriteInputs).includes('DO_NOT_FORWARD'));
    },
  );
  await check(
    'zero minimum still visits sources; invalid bounds and retired input fail before effects',
    async () => {
      const result = await run({ minSuccessfulSources: 0 });
      assert.equal(result.insufficient, false);
      assert.equal(queries.length, 1);
      assert.equal(visits.length, 5);
      const queriesBefore = queries.length;
      for (const extra of [{ maxFollowResults: 1, minSuccessfulSources: 2 }]) {
        const invalid = await prepared.run({ instruction: saved.instruction, ...extra });
        assert.equal(invalid.status, 'failed');
      }
      await assert.rejects(
        prepared.run({ instruction: saved.instruction, minRelevantResults: 1 }),
        /additional properties/,
      );
      assert.equal(queries.length, queriesBefore);
    },
  );
  await check('challenge, evidence failure and cancellation stay terminal', async () => {
    failSearch = true;
    let result = await prepared.run({ instruction: saved.instruction, query: 'initial' });
    assert.equal(result.status, 'failed');
    assert.equal(rewriteInputs.length, 0);
    failSearch = false;
    fatalVisit = true;
    await assert.rejects(
      prepared.run({ instruction: saved.instruction, query: 'initial' }),
      /Evidence observer failed/,
    );
    fatalVisit = false;
    controller = new AbortController();
    await assert.rejects(
      prepared.run(
        { instruction: saved.instruction, query: 'initial' },
        { signal: controller.signal },
      ),
      /Run cancelled/,
    );
    assert.equal(rewriteInputs.length, 0);
  });
  await check('ranking provider failure cannot fall back to provider order', async () => {
    failRanking = true;
    const result = await prepared.run({ instruction: saved.instruction, query: 'initial' });
    assert.equal(result.status, 'failed');
    assert.equal(visits.length, 0);
    assert.equal(rewriteInputs.length, 0);
  });
  console.log(`[pass] bounded search: ${checks} offline cases; no HTTP or paid model requests`);
} finally {
  search.close();
}
