import assert from 'node:assert/strict';
import type { AgentSpec, Calls } from '../src/discovery/calls.js';
import type { discover, DiscoveryResult } from '../src/discovery/discover.js';
import type { WebTransport } from '../src/web/transport.js';
import { captureBody, type HttpSource } from '../src/web/source.js';
import { search, SearchError } from '../src/search/search.js';
import { duckduckgo } from '../src/search/duckduckgo.js';

const source = (url: string, html: string, status = 200): HttpSource => {
  const body = captureBody(new TextEncoder().encode(html));
  return {
    url,
    status,
    headers: { 'content-type': ['text/html; charset=utf-8'] },
    encoded: body,
    body,
  };
};
const resultsPage = (urls: string[]) =>
  urls
    .map(
      (u) =>
        `<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}">${u}</a></div>`,
    )
    .join('');
const providerUrl = (query: string) => {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  return url.href;
};
const fetcherFor = (
  pages: Record<string, () => HttpSource>,
): WebTransport & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    get: async (url) => {
      asked.push(url);
      const make = pages[url];
      if (!make) throw new Error(`no page ${url}`);
      return make();
    },
    post: async () => assert.fail('no POST in this test'),
    close: () => {},
  };
};

// Model answers in order per job; every answer goes through the job's own check, and the retry texts are kept.
const scripted = (answers: Record<string, unknown[]>) => {
  const inputs: Record<string, unknown[]> = {};
  const retries: string[] = [];
  const calls: Calls = {
    event: () => {},
    jevLeft: () => 0,
    decide: async () => null,
    async agent<T>(spec: AgentSpec<T>) {
      (inputs[spec.job] ??= []).push(JSON.parse(String(spec.input)));
      for (let step = 0; step < spec.steps; step++) {
        const next = answers[spec.job]?.shift();
        if (next === undefined) return null;
        const retry = await spec.validate(next as T);
        if (retry === null) return next as T;
        retries.push(retry);
      }
      return null;
    },
  };
  return { calls, inputs, retries };
};
const discoveryOf = (usable: Set<string>, seen: string[]): typeof discover =>
  (async (request) => {
    seen.push(request.url);
    const ready = usable.has(request.url);
    return {
      status: ready ? 'ready' : 'unresolved',
      reason: ready ? null : 'read at depth 0 failed',
      artifact: null,
      data: ready ? [{ name: 'x' }] : null,
      trial: null,
      findings: ready ? ['3 items, the reader counted 4'] : [],
      next: [],
      attempts: [],
      usage: {},
      inputTokens: 0,
      elapsedMs: 0,
      blocked: null,
      events: [],
    } satisfies DiscoveryResult;
  }) as typeof discover;
const options = { groqKey: 'x', typesafeKey: 'y' };

// Two rounds: the first queue is spent with one usable source of the two needed, so the query is rewritten; the
// second page's already attempted address is not offered again; each visit spends one follow slot.
{
  const web = fetcherFor({
    [providerUrl('ai meetups vienna')]: () =>
      source(
        providerUrl('ai meetups vienna'),
        resultsPage(['https://a.test/', 'https://b.test/', 'https://c.test/']),
      ),
    [providerUrl('artificial intelligence meetup Vienna')]: () =>
      source(
        providerUrl('artificial intelligence meetup Vienna'),
        resultsPage(['https://b.test/', 'https://d.test/']),
      ),
  });
  const model = scripted({
    rank: [{ rankedIds: ['9', '1', '1'] }, { rankedIds: ['1', '0'] }, { rankedIds: ['1'] }],
    rewrite: [{ query: 'ai meetups vienna' }, { query: 'artificial intelligence meetup Vienna' }],
  });
  const visited: string[] = [];
  const result = await search(
    {
      instruction: 'Show me a list of ai meetups in Vienna!',
      query: 'ai meetups vienna',
      maxFollowResults: 3,
      minSuccessfulSources: 2,
    },
    {
      ...options,
      web,
      calls: model.calls,
      discover: discoveryOf(new Set(['https://a.test/', 'https://d.test/']), visited),
    },
  );
  assert.deepEqual(visited, ['https://b.test/', 'https://a.test/', 'https://d.test/']);
  assert.deepEqual(
    result.attempts.map((a) => [a.query, a.rankedIds]),
    [
      ['ai meetups vienna', ['1', '0']],
      ['artificial intelligence meetup Vienna', ['1']],
    ],
  );
  assert.deepEqual(
    result.attempts[1]?.candidates.map((c) => c.url),
    ['https://d.test/'],
  );
  assert.equal(result.successfulSources, 2);
  assert.equal(result.insufficient, false);
  assert.equal(result.continuationError, null);
  assert.deepEqual(model.retries, [
    'These ids are not in results: 9. These ids appear more than once: 1',
    'The query "ai meetups vienna" was already sent. Return a different query, or null when no justified alternative remains',
  ]);
  // What the models were shown: the approved keys, observations as { url, status, reason, findings }.
  const second = model.inputs.rank?.[1] as Record<string, unknown>;
  assert.deepEqual(Object.keys(second), [
    'instruction',
    'query',
    'asOf',
    'results',
    'maxResults',
    'observations',
    'perDestination',
  ]);
  assert.equal(second.maxResults, 1);
  assert.deepEqual((second.observations as unknown[])[0], {
    url: 'https://b.test/',
    status: 'unresolved',
    reason: 'read at depth 0 failed',
    findings: [],
  });
  assert.deepEqual(second.perDestination, {
    allowLinkFollowing: true,
    linkDepth: 1,
    maxPages: 21,
    outputSchema: null,
  });
  assert.deepEqual(Object.keys(model.inputs.rewrite?.[0] as object), [
    'instruction',
    'queries',
    'observations',
    'asOf',
  ]);
  assert.deepEqual((model.inputs.rewrite?.[0] as { queries: string[] }).queries, [
    'ai meetups vienna',
  ]);
}

// A null rewrite ends the search; too few usable sources is reported, not an error.
{
  const web = fetcherFor({
    [providerUrl('q')]: () => source(providerUrl('q'), resultsPage(['https://a.test/'])),
  });
  const model = scripted({ rank: [{ rankedIds: ['0'] }], rewrite: [{ query: null }] });
  const result = await search(
    { instruction: 'q', minSuccessfulSources: 1 },
    { ...options, web, calls: model.calls, discover: discoveryOf(new Set(), []) },
  );
  assert.equal(result.successfulSources, 0);
  assert.equal(result.insufficient, true);
  assert.equal(result.attempts.length, 1);
}

// A failed page in a later round keeps the usable sources and says what failed; in the first round it fails the search.
{
  const web = fetcherFor({
    [providerUrl('q')]: () => source(providerUrl('q'), resultsPage(['https://a.test/'])),
    [providerUrl('q2')]: () => source(providerUrl('q2'), '<p>changed layout</p>'),
  });
  const model = scripted({ rank: [{ rankedIds: ['0'] }], rewrite: [{ query: 'q2' }] });
  const result = await search(
    { instruction: 'q', minSuccessfulSources: 2 },
    {
      ...options,
      web,
      calls: model.calls,
      discover: discoveryOf(new Set(['https://a.test/']), []),
    },
  );
  assert.equal(result.successfulSources, 1);
  assert.equal(result.continuationError?.phase, 'search');
  assert.equal(result.continuationError?.error.code, 'SEARCH_PAGE');

  const first = fetcherFor({
    [providerUrl('q2')]: () => source(providerUrl('q2'), '<p>changed layout</p>'),
  });
  await assert.rejects(
    search(
      { instruction: 'q2' },
      { ...options, web: first, calls: scripted({}).calls, discover: discoveryOf(new Set(), []) },
    ),
    (e: unknown) => e instanceof SearchError && e.code === 'SEARCH_PAGE',
  );
}

// Refused before any request: a minimum above the follow slots, and a provider with a challenge but no TypeSafe key.
{
  const web = fetcherFor({});
  await assert.rejects(
    search({ instruction: 'q', maxFollowResults: 1, minSuccessfulSources: 2 }, { ...options, web }),
    (e: unknown) => e instanceof SearchError && e.code === 'SEARCH_MINIMUM',
  );
  await assert.rejects(
    search({ instruction: 'q' }, { groqKey: 'x', web, provider: duckduckgo }),
    (e: unknown) => e instanceof SearchError && e.code === 'SEARCH_JEV_KEY',
  );
  assert.deepEqual(web.asked, []);
}

console.log('search: rounds, slots, rewrite condition, retries, later-round failures, refusals');
