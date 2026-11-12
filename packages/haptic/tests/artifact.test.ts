import assert from 'node:assert/strict';
import {
  ArtifactError,
  fetchPage,
  prepareArtifact,
  walk,
  WalkError,
  type Policy,
} from '../src/artifact/index.js';
import type { WebTransport } from '../src/web/transport.js';
import { captureBody, type HttpSource } from '../src/web/source.js';

const page = (
  url: string,
  html: string,
  status = 200,
  headers: Record<string, string[]> = {},
): HttpSource => {
  const body = captureBody(new TextEncoder().encode(html));
  return {
    url,
    status,
    headers: { 'content-type': ['text/html; charset=utf-8'], ...headers },
    encoded: body,
    body,
  };
};
const signal = AbortSignal.timeout(30_000);
const policy: Policy = {
  maxPages: 10,
  maxRedirects: 2,
  stripFragments: true,
  accept: { statuses: [200] },
};
const copy = (names: string[]) => ({
  $map: {
    over: { $ref: '$.records' },
    as: 'r',
    body: Object.fromEntries(
      names.map((name) => [name, { $get: { from: { $var: 'r' }, path: ['fields', name] } }]),
    ),
  },
});
const anything = { type: 'array' };

// One record stage: the header row has no name (required), the where test folds case and dashes, the limit counts
// records that passed, a list field keeps every match, addresses resolve against <base>.
const releases = page(
  'https://example.com/releases/',
  `<html><head><base href="https://cdn.example.com/files/"></head><body><table>
  <tr><th>Name</th><th>Notes</th></tr>
  <tr><td class="n">Tool 1.0 ‑ Stable</td><td><a href="tool-1.0.zip">zip</a></td><td><i>fast</i><i>small</i></td></tr>
  <tr><td class="n">Tool 0.9 beta</td><td><a href="tool-0.9.zip">zip</a></td><td></td></tr>
  <tr><td class="n">Tool 0.8 - STABLE</td><td><a href="tool-0.8.zip">zip</a></td><td><i>old</i></td></tr>
  <tr><td class="n">Tool 0.7 - stable</td><td><a href="tool-0.7.zip">zip</a></td><td></td></tr>
  </table></body></html>`,
);
const records = prepareArtifact({
  stamp: { 'nisc.haptic': 0, 'nisc.prism': 0 },
  policy,
  stages: [
    {
      kind: 'records',
      format: 'html',
      render: false,
      selector: 'tr',
      fields: {
        name: { selector: 'td.n', attribute: null },
        file: { selector: 'a', attribute: 'href' },
        tags: { selector: 'i', attribute: null, list: true },
      },
      required: ['name'],
      where: { in: 'name', contains: 'tool 1.0 - stable' },
      limit: null,
    },
  ],
  mapping: copy(['name', 'file', 'tags']),
  outputSchema: anything,
});
const one = await walk(records, releases.url, { signal, pages: async () => releases });
assert.deepEqual(one.data, [
  {
    name: 'Tool 1.0 ‑ Stable',
    file: 'https://cdn.example.com/files/tool-1.0.zip',
    tags: ['fast', 'small'],
  },
]);
assert.equal(one.broken, false);

const stable = prepareArtifact({
  ...records.artifact,
  stages: [{ ...records.artifact.stages[0], where: { in: 'text', contains: 'stable' }, limit: 2 }],
});
const two = await walk(stable, releases.url, { signal, pages: async () => releases });
assert.deepEqual(
  (two.data as { name: string }[]).map((item) => item.name),
  ['Tool 1.0 ‑ Stable', 'Tool 0.8 - STABLE'],
);

// A link stage: distinct addresses, fragments removed, the page itself not followed again, at most `limit`.
// A followed page that yields no records marks the run broken.
const index = page(
  'https://example.com/news/',
  `<ul><li><a href="/news/a#top">A</a></li><li><a href="/news/a">A again</a></li><li><a href="/news/">Index</a></li>
   <li><a href="/news/b">B</a></li><li><a href="/news/c">C</a></li></ul>`,
);
const pages = new Map([
  [index.url, index],
  [
    'https://example.com/news/a',
    page('https://example.com/news/a', '<h1>Post A</h1><p>one</p><p>two</p>'),
  ],
  ['https://example.com/news/b', page('https://example.com/news/b', '<p>moved</p>')],
]);
const linked = prepareArtifact({
  stamp: { 'nisc.haptic': 0, 'nisc.prism': 0 },
  policy,
  stages: [
    {
      kind: 'links',
      format: 'html',
      render: false,
      selector: 'li',
      link: { selector: 'a', attribute: 'href' },
      limit: 2,
    },
    {
      kind: 'records',
      format: 'html',
      render: false,
      selector: 'body',
      fields: {
        title: { selector: 'h1', attribute: null },
        body: { selector: 'p', attribute: null, list: true },
      },
      required: ['title'],
      where: null,
      limit: null,
    },
  ],
  mapping: copy(['title', 'body']),
  outputSchema: anything,
});
const followed = await walk(linked, index.url, {
  signal,
  pages: async (url) => pages.get(url) ?? assert.fail(`not a page of this test: ${url}`),
});
assert.deepEqual(followed.visited, [
  index.url,
  'https://example.com/news/a',
  'https://example.com/news/b',
]);
assert.deepEqual(followed.data, [{ title: 'Post A', body: ['one', 'two'] }]);
assert.deepEqual(followed.emptyPages, ['https://example.com/news/b']);
assert.equal(followed.broken, true);
assert.equal(followed.limited, false);

// The page cap cuts a link stage short, and says so.
const capped = prepareArtifact({ ...linked.artifact, policy: { ...policy, maxPages: 2 } });
const short = await walk(capped, index.url, {
  signal,
  pages: async (url) => pages.get(url) ?? assert.fail(url),
});
assert.deepEqual(short.visited, [index.url, 'https://example.com/news/a']);
assert.equal(short.limited, true);

// Checked once when prepared: grammar, program, output schema.
const refused = (value: unknown, code: string) =>
  assert.throws(
    () => prepareArtifact(value),
    (error: unknown) => error instanceof ArtifactError && error.code === code,
  );
refused(
  { ...records.artifact, stages: [...records.artifact.stages, linked.artifact.stages[0]] },
  'GRAMMAR',
);
refused({ ...records.artifact, mapping: { $nope: 1 } }, 'PROGRAM');
refused({ ...records.artifact, outputSchema: { type: 'nonsense' } }, 'OUTPUT_SCHEMA');

// Data that does not fit the output schema is an error, not a result.
const strict = prepareArtifact({
  ...records.artifact,
  outputSchema: {
    type: 'array',
    items: { type: 'object', properties: { tags: { type: 'array', minItems: 3 } } },
  },
});
await assert.rejects(
  walk(strict, releases.url, { signal, pages: async () => releases }),
  (error: unknown) => error instanceof WalkError && error.code === 'SCHEMA',
);

// Redirects are followed within the policy; the final status must be accepted.
const answers = (map: Record<string, HttpSource>): WebTransport => ({
  get: async (url) => map[url] ?? assert.fail(url),
  post: async () => assert.fail('no POST here'),
  close: () => {},
});
const moved = answers({
  'https://a.test/': page('https://a.test/', '', 301, { location: ['/b'] }),
  'https://a.test/b': page('https://a.test/b', '<p>here</p>'),
  'https://a.test/loop': page('https://a.test/loop', '', 302, { location: ['/loop'] }),
  'https://a.test/gone': page('https://a.test/gone', '', 404),
});
const hops: { from: string; to: string; status: number }[] = [];
assert.equal(
  (await fetchPage(moved, 'https://a.test/', policy, signal, hops)).url,
  'https://a.test/b',
);
assert.deepEqual(hops, [{ from: 'https://a.test/', to: 'https://a.test/b', status: 301 }]);
await assert.rejects(
  fetchPage(moved, 'https://a.test/loop', policy, signal),
  (error: unknown) => error instanceof WalkError && error.code === 'REDIRECTS',
);
await assert.rejects(
  fetchPage(moved, 'https://a.test/gone', policy, signal),
  (error: unknown) => error instanceof WalkError && error.code === 'STATUS',
);

console.log('artifact: record and link stages, preparation checks, output schema, redirects');
