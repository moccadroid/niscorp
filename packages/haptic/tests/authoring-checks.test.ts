import assert from 'node:assert/strict';
import { z } from 'zod';
import { checkHtmlCandidate } from './helpers/discovery-policy.js';
import { captureBody } from '../src/operations/http-source.js';
import { discoveryProfile } from '../src/discovery/index.js';

const source = (html: string, suffix: string) => ({
  url: 'https://example.test/' + suffix,
  status: 200,
  headers: {},
  encoded: captureBody(Buffer.from(html)),
  body: captureBody(Buffer.from(html)),
});
const policy = discoveryProfile.authoring;
const sources = [
  source('<main><a href="/one">One</a><a href="/two">Two</a></main>', 'one'),
  source('<section><p>Different layout</p></section>', 'two'),
];
const check = (
  rules: { selector: string | null; links: string | null },
  authoring = policy,
  minimumResultMatches = 0,
) =>
  checkHtmlCandidate({
    sources,
    rules: { ...rules, preconditions: [], result: null },
    authoring,
    minimumResultMatches,
  });
const rule = { selector: 'main a', links: null };
assert((await check(rule, { ...policy, minimumMatchesAcrossPages: 2 })).accepted);
const missing = await check({ selector: '.missing', links: null });
assert(!missing.accepted);
const report = z
  .object({
    error: z.string(),
    role: z.string(),
    selector: z.string(),
    actualMatches: z.number(),
    minimumMatchesAcrossPages: z.number(),
    pages: z.array(
      z.object({
        url: z.string(),
        matches: z.number(),
        diagnostics: z.object({ nodes: z.array(z.json()) }).passthrough(),
      }),
    ),
  })
  .parse(missing.feedback);
assert(report.pages.every((page) => page.diagnostics.nodes.length === 0));
assert.deepEqual(
  { ...report, pages: report.pages.map(({ url, matches }) => ({ url, matches })) },
  {
    error: 'AUTHORING_MINIMUM_MATCHES',
    role: 'selector',
    selector: '.missing',
    actualMatches: 0,
    minimumMatchesAcrossPages: 1,
    pages: sources.map(({ url }) => ({ url, matches: 0 })),
  },
);
const noLinks = await check({ ...rule, links: '.missing' });
assert(!noLinks.accepted);
assert.equal(z.object({ role: z.string() }).parse(noLinks.feedback).role, 'links');
const noRule = await check({ selector: null, links: null });
assert(!noRule.accepted);
assert.equal(z.object({ error: z.string() }).parse(noRule.feedback).error, 'SOURCE_RULE_EMPTY');
assert(
  (await check({ selector: '.missing', links: null }, { ...policy, minimumMatchesAcrossPages: 0 }))
    .accepted,
);
assert((await check({ selector: null, links: 'main a' })).accepted);
assert((await check({ ...rule, links: 'main' })).accepted);
const perPage = await check(rule, policy, 1);
assert(!perPage.accepted);
assert.equal(z.object({ error: z.string() }).parse(perPage.feedback).error, 'MINIMUM_MATCHES');
const nested = { selector: 'main, main a', links: null };
assert((await check(nested)).accepted);
const overlap = await check(nested, { ...policy, allowOverlappingResults: false });
assert(!overlap.accepted);
const diagnostic = z
  .object({
    error: z.string(),
    url: z.string(),
    parentPath: z.array(z.number()),
    childPath: z.array(z.number()),
  })
  .parse(overlap.feedback);
assert.equal(diagnostic.error, 'OVERLAPPING_RESULTS');
assert.equal(diagnostic.url, sources[0]?.url);
assert.deepEqual(
  diagnostic.childPath.slice(0, diagnostic.parentPath.length),
  diagnostic.parentPath,
);
assert(diagnostic.childPath.length > diagnostic.parentPath.length);
assert((await check(nested, { ...policy, allowOverlappingResults: true })).accepted);
assert((await check({ selector: 'main a, main a', links: null })).accepted);
const largeSources = [source('<main><p>' + 'x'.repeat(1000) + '</p></main>', 'large')];
const overlappingRule = { selector: 'main, p', links: null, result: null, preconditions: [] };
const hiddenOverlap = await checkHtmlCandidate({
  sources: largeSources,
  rules: overlappingRule,
  authoring: { ...policy, allowOverlappingResults: false },
});
assert(!hiddenOverlap.accepted);
assert.equal(
  z.object({ error: z.string() }).parse(hiddenOverlap.feedback).error,
  'OVERLAPPING_RESULTS',
);
const permitted = await checkHtmlCandidate({
  sources: largeSources,
  rules: overlappingRule,
  authoring: { ...policy, allowOverlappingResults: true },
});
assert(permitted.accepted);
const facts = z
  .object({
    queries: z.array(
      z.object({
        total: z.number().nullable(),
        pages: z.array(
          z.object({
            report: z.object({
              total: z.number(),
              overlap: z
                .object({ parentPath: z.array(z.number()), childPath: z.array(z.number()) })
                .nullable(),
            }),
          }),
        ),
      }),
    ),
  })
  .parse(permitted.facts);
assert.equal(facts.queries[0]?.total, 2);
assert.equal(facts.queries[0]?.pages[0]?.report.total, 2);
assert(facts.queries[0]?.pages[0]?.report.overlap);
const cancellation = new AbortController();
cancellation.abort(new Error('Stop'));
await assert.rejects(
  checkHtmlCandidate({ sources, rules: overlappingRule, signal: cancellation.signal }),
  /Stop/,
);
console.log(
  '[pass] JSON admission: across-page/per-page minima, independent roles, overlap, policy overrides, exact facts and cancellation',
);
