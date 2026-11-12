import assert from 'node:assert/strict';
import { ArtifactError, prepareArtifact, walk, WalkError } from '../src/artifact/index.js';
import type { WebTransport } from '../src/web/transport.js';
import { captureBody, type HttpSource } from '../src/web/source.js';

const source = (
  url: string,
  body: string,
  type: string,
  status = 200,
  headers: Record<string, string[]> = {},
): HttpSource => {
  const bytes = captureBody(new TextEncoder().encode(body));
  return {
    url,
    status,
    headers: { 'content-type': [type], ...headers },
    encoded: bytes,
    body: bytes,
  };
};
const signal = AbortSignal.timeout(20_000);
const stamp = { 'nisc.haptic': 0, 'nisc.prism': 3 };
const policy = {
  maxPages: 10,
  maxRedirects: 2,
  stripFragments: true,
  accept: { statuses: [200] },
  maxResources: 1,
};
const copy = (names: string[]) => ({
  $map: {
    over: { $ref: '$.records' },
    as: 'r',
    body: Object.fromEntries(
      names.map((n) => [n, { $get: { from: { $var: 'r' }, path: ['fields', n] } }]),
    ),
  },
});

// An Atom feed leads to article pages (reference stage); each article page names its PDF (resource rule); the files
// beyond maxResources are not downloaded.
const feed = source(
  'https://papers.test/feed',
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>One</title><link href="/abs/1"/></entry>
    <entry><title>Two</title><link href="/abs/2"/></entry>
  </feed>`,
  'application/atom+xml',
);
const article = (n: number) =>
  source(
    `https://papers.test/abs/${n}`,
    `<h1>Paper ${n}</h1><a class="pdf" href="/pdf/${n}.pdf">PDF</a>`,
    'text/html',
  );
const pdf = (n: number) =>
  source(`https://papers.test/pdf/${n}.pdf`, `%PDF-${n}`, 'application/pdf');
const pages = new Map([feed, article(1), article(2), pdf(1), pdf(2)].map((s) => [s.url, s]));
const fromPages = async (url: string) =>
  pages.get(url) ?? assert.fail(`not a page of this test: ${url}`);

const papers = prepareArtifact({
  stamp,
  policy,
  stages: [
    {
      kind: 'references',
      format: 'xml',
      selector: '//a:entry',
      namespaces: { a: 'http://www.w3.org/2005/Atom' },
      fields: { link: 'string(a:link/@href)' },
      references: {
        links: {
          $map: {
            over: { $ref: '$.records' },
            as: 'r',
            body: { $get: { from: { $var: 'r' }, path: ['fields', 'link'] } },
          },
        },
      },
      limit: null,
    },
    {
      kind: 'records',
      format: 'html',
      render: false,
      selector: 'body',
      fields: { title: { selector: 'h1', attribute: null } },
      required: ['title'],
      where: null,
      limit: null,
      resources: { selector: 'a.pdf', attribute: 'href' },
    },
  ],
  mapping: copy(['title']),
  outputSchema: { type: 'array' },
});
const run = await walk(papers, feed.url, { signal, pages: fromPages });
assert.deepEqual(run.visited, [
  'https://papers.test/feed',
  'https://papers.test/abs/1',
  'https://papers.test/abs/2',
]);
assert.deepEqual(run.data, [{ title: 'Paper 1' }, { title: 'Paper 2' }]);
assert.deepEqual(
  run.resources.map((r) => r.url),
  ['https://papers.test/pdf/1.pdf'],
);

// XML records with required, where and limit, as for HTML.
const items = prepareArtifact({
  stamp,
  policy,
  stages: [
    {
      kind: 'records',
      format: 'xml',
      selector: '//a:entry',
      namespaces: { a: 'http://www.w3.org/2005/Atom' },
      fields: { title: 'string(a:title)' },
      required: ['title'],
      where: { in: 'title', contains: 'TWO' },
      limit: 1,
    },
  ],
  mapping: copy(['title']),
  outputSchema: { type: 'array' },
});
assert.deepEqual((await walk(items, feed.url, { signal, pages: fromPages })).data, [
  { title: 'Two' },
]);

// A JSON document is one record; a JSON reference stage leads to other documents.
const api = new Map(
  [
    source('https://api.test/list', JSON.stringify({ next: ['/item/7'] }), 'application/json'),
    source(
      'https://api.test/item/7',
      JSON.stringify({ name: 'seven', tags: ['a'] }),
      'application/json',
    ),
  ].map((s) => [s.url, s]),
);
const json = prepareArtifact({
  stamp,
  policy,
  stages: [
    {
      kind: 'references',
      format: 'json',
      references: { links: { $ref: '$.document.next' } },
      limit: null,
    },
    { kind: 'records', format: 'json' },
  ],
  mapping: {
    $map: {
      over: { $ref: '$.records' },
      as: 'r',
      body: { name: { $get: { from: { $var: 'r' }, path: ['document', 'name'] } } },
    },
  },
  outputSchema: { type: 'array' },
});
assert.deepEqual(
  (
    await walk(json, 'https://api.test/list', {
      signal,
      pages: async (u) => api.get(u) ?? assert.fail(u),
    })
  ).data,
  [{ name: 'seven' }],
);

// Checked when prepared: a broken reference program, and a record stage before the last.
assert.throws(
  () =>
    prepareArtifact({
      ...json.artifact,
      stages: [
        { kind: 'references', format: 'json', references: { $nope: 1 }, limit: null },
        { kind: 'records', format: 'json' },
      ],
    }),
  (e: unknown) => e instanceof ArtifactError && e.code === 'PROGRAM',
);
assert.throws(
  () =>
    prepareArtifact({
      ...json.artifact,
      stages: [
        { kind: 'records', format: 'json' },
        { kind: 'records', format: 'json' },
      ],
    }),
  (e: unknown) => e instanceof ArtifactError && e.code === 'GRAMMAR',
);

// Media types are checked on pages when the policy lists them, not on downloaded files; two addresses that redirect
// to one page read it once.
const live = new Map<string, HttpSource>([
  [
    'https://site.test/',
    source('https://site.test/', '<a href="/a">a</a><a href="/b">b</a>', 'text/html'),
  ],
  [
    'https://site.test/a',
    source('https://site.test/a', '', 'text/html', 301, { location: ['/same'] }),
  ],
  [
    'https://site.test/b',
    source('https://site.test/b', '', 'text/html', 302, { location: ['/same'] }),
  ],
  [
    'https://site.test/same',
    source(
      'https://site.test/same',
      '<h1>Same</h1><a class="pdf" href="/f.pdf">f</a>',
      'text/html; charset=utf-8',
    ),
  ],
  ['https://site.test/f.pdf', source('https://site.test/f.pdf', '%PDF', 'application/pdf')],
  ['https://site.test/feed.xml', source('https://site.test/feed.xml', '<x/>', 'application/xml')],
]);
const web: WebTransport = {
  get: async (u) => live.get(u) ?? assert.fail(u),
  post: async () => assert.fail('no POST'),
  close: () => {},
};
const site = prepareArtifact({
  stamp,
  policy: { ...policy, accept: { statuses: [200], mediaTypes: ['text/html'] } },
  stages: [
    {
      kind: 'links',
      format: 'html',
      render: false,
      selector: 'a',
      link: { selector: ':scope', attribute: 'href' },
      limit: null,
    },
    {
      kind: 'records',
      format: 'html',
      render: false,
      selector: 'body',
      fields: { title: { selector: 'h1', attribute: null } },
      required: [],
      where: null,
      limit: null,
      resources: { selector: 'a.pdf', attribute: 'href' },
    },
  ],
  mapping: copy(['title']),
  outputSchema: { type: 'array' },
});
const once = await walk(site, 'https://site.test/', { signal, web });
assert.deepEqual(once.data, [{ title: 'Same' }]);
assert.deepEqual(
  once.resources.map((r) => r.url),
  ['https://site.test/f.pdf'],
);
assert.deepEqual(
  once.redirects.map((r) => r.to),
  ['https://site.test/same', 'https://site.test/same'],
);
await assert.rejects(
  walk(site, 'https://site.test/feed.xml', { signal, web }),
  (e: unknown) => e instanceof WalkError && e.code === 'MEDIA_TYPE',
);

console.log(
  'artifact formats: XML references and records, JSON stages, resources, media types, aliases',
);
