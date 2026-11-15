import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { prepareArtifact, WalkError } from '../src/artifact/index.js';
import type { PageRequest } from '../src/artifact/request.js';
import { captureBody, type HttpSource } from '../src/web/source.js';
import { createWebTransport, type WebTransport } from '../src/web/transport.js';

const signal = AbortSignal.timeout(60_000);
const stamp = { 'nisc.haptic': 1, 'nisc.prism': 3 };
const policy = (maxPages = 10) => ({
  maxPages,
  maxRedirects: 3,
  stripFragments: true,
  accept: { statuses: [200] },
});
const source = (
  url: string,
  body: string,
  type = 'text/html',
  status = 200,
  headers: Record<string, string[]> = {},
): HttpSource => ({
  url,
  status,
  headers: { 'content-type': [type], ...headers },
  encoded: captureBody(Buffer.from(body)),
  body: captureBody(Buffer.from(body)),
});
const html = (items: string[], next?: string) =>
  `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>${next ? `<a class="more" href="${next}">More</a>` : ''}`;
const items = {
  kind: 'records',
  format: 'html',
  render: false,
  selector: 'li',
  fields: { title: { selector: ':scope', attribute: null } },
  required: ['title'],
  where: null,
  limit: null,
};
const titles = {
  $map: {
    over: { $ref: '$.records' },
    as: 'r',
    body: { $get: { from: { $var: 'r' }, path: ['fields', 'title'] } },
  },
};
const fromJson = {
  $flatMap: {
    over: { $ref: '$.records' },
    as: 'r',
    body: { $get: { from: { $var: 'r' }, path: ['document', 'items'] } },
  },
};
const list = { type: 'array' };
const more = { selector: 'a.more', attribute: 'href' };

// A web that answers each request by a function of it, keeping every request it was sent.
const webOf = (answer: (request: PageRequest) => HttpSource) => {
  const sent: PageRequest[] = [];
  const web: WebTransport = {
    get: async (url) => answer({ method: 'GET', url, headers: {}, body: null }),
    send: async (request) => {
      sent.push(request);
      return answer(request);
    },
    post: async () => assert.fail('the walk sends, it does not post'),
    close: () => {},
  };
  return { web, sent };
};
const pagesOf = (map: Record<string, HttpSource>) => async ({ url }: PageRequest) =>
  map[url] ?? assert.fail(`not a page of this test: ${url}`);

// A next link pages on until a page has none.
const hn = prepareArtifact({ stamp, next: more, policy: policy(), stages: [items], mapping: titles, outputSchema: list });
const three = {
  'https://n.test/': source('https://n.test/', html(['a', 'b'], '?p=2')),
  'https://n.test/?p=2': source('https://n.test/?p=2', html(['c', 'd'], '?p=3')),
  'https://n.test/?p=3': source('https://n.test/?p=3', html(['e'])),
};
const all = await hn.run({ url: 'https://n.test/' }, { signal, pages: pagesOf(three) });
assert.deepEqual(all.data, ['a', 'b', 'c', 'd', 'e']);
assert.deepEqual(all.visited, ['https://n.test/', 'https://n.test/?p=2', 'https://n.test/?p=3']);
assert.equal(all.limited, false);
assert.equal(all.broken, false);

// maxPages ends it and says so.
const capped = prepareArtifact({ stamp, next: more, policy: policy(2), stages: [items], mapping: titles, outputSchema: list });
const two = await capped.run({ url: 'https://n.test/' }, { signal, pages: pagesOf(three) });
assert.deepEqual(two.data, ['a', 'b', 'c', 'd']);
assert.equal(two.limited, true);

// A last page that links back to page 1 ends it: that request was already sent.
const back = {
  'https://n.test/': source('https://n.test/', html(['a'], '?p=2')),
  'https://n.test/?p=2': source('https://n.test/?p=2', html(['b'], '/')),
};
assert.deepEqual((await hn.run({ url: 'https://n.test/' }, { signal, pages: pagesOf(back) })).data, ['a', 'b']);

// A page that gives nothing new ends it, is not a broken page, and its repeated records are left out.
const repeated = {
  'https://n.test/': source('https://n.test/', html(['a', 'b'], '?p=2')),
  'https://n.test/?p=2': source('https://n.test/?p=2', html(['b', 'c'], '?p=3')),
  'https://n.test/?p=3': source('https://n.test/?p=3', html(['a', 'c'], '?p=4')),
  'https://n.test/?p=4': source('https://n.test/?p=4', html(['z'])),
};
const seen = await hn.inspect({ url: 'https://n.test/' }, { signal, pages: pagesOf(repeated) });
assert.deepEqual(seen.result?.data, ['a', 'b', 'c']);
assert.deepEqual(seen.result?.emptyPages, []);
assert.equal(seen.result?.broken, false);
assert.deepEqual(
  seen.pages.map((page) => ({ url: page.url, link: page.link, kept: 'kept' in page ? page.kept : null })),
  [
    { url: 'https://n.test/', link: undefined, kept: 2 },
    { url: 'https://n.test/?p=2', link: 'https://n.test/?p=2', kept: 1 },
    { url: 'https://n.test/?p=3', link: 'https://n.test/?p=3', kept: 0 },
  ],
);
assert.equal(seen.pages[1] && 'duplicates' in seen.pages[1] ? seen.pages[1].duplicates : null, 1);

// Detail pages reached by a link stage still keep a record they share, and an empty one still marks the run broken.
const detail = (title: string) => html([title]);
const crawled = prepareArtifact({
  stamp,
  policy: policy(),
  stages: [
    { kind: 'links', format: 'html', render: false, selector: 'a.d', link: { selector: ':scope', attribute: 'href' }, limit: null },
    items,
  ],
  mapping: titles,
  outputSchema: list,
});
const details = {
  'https://d.test/': source('https://d.test/', '<a class="d" href="/1">1</a><a class="d" href="/2">2</a><a class="d" href="/3">3</a>'),
  'https://d.test/1': source('https://d.test/1', detail('same')),
  'https://d.test/2': source('https://d.test/2', detail('same')),
  'https://d.test/3': source('https://d.test/3', '<p>gone</p>'),
};
const crawl = await crawled.run({ url: 'https://d.test/' }, { signal, pages: pagesOf(details) });
assert.deepEqual(crawl.data, ['same', 'same']);
assert.deepEqual(crawl.emptyPages, ['https://d.test/3']);
assert.equal(crawl.broken, true);

// An index that continues pages on until it holds what the stage's limit and maxPages leave room for.
const index = prepareArtifact({
  stamp,
  next: more,
  policy: policy(5),
  stages: [
    { kind: 'links', format: 'html', render: false, selector: 'a.d', link: { selector: ':scope', attribute: 'href' }, limit: null },
    items,
  ],
  mapping: titles,
  outputSchema: list,
});
const link = (n: number) => `<a class="d" href="/${n}">${n}</a>`;
const indexPages: Record<string, HttpSource> = {
  'https://i.test/': source('https://i.test/', `${link(1)}${link(2)}<a class="more" href="/?p=2">More</a>`),
  'https://i.test/?p=2': source('https://i.test/?p=2', `${link(3)}${link(4)}<a class="more" href="/?p=3">More</a>`),
  'https://i.test/?p=3': source('https://i.test/?p=3', `${link(5)}${link(6)}`),
};
for (const n of [1, 2, 3, 4, 5, 6]) indexPages[`https://i.test/${n}`] = source(`https://i.test/${n}`, detail(`r${n}`));
const indexed = await index.run({ url: 'https://i.test/' }, { signal, pages: pagesOf(indexPages) });
assert.deepEqual(indexed.data, ['r1', 'r2', 'r3']);
assert.deepEqual(indexed.visited, ['https://i.test/', 'https://i.test/?p=2', 'https://i.test/1', 'https://i.test/2', 'https://i.test/3']);
assert.equal(indexed.limited, true);
const limitedIndex = prepareArtifact({
  stamp,
  next: more,
  policy: policy(20),
  stages: [
    { kind: 'links', format: 'html', render: false, selector: 'a.d', link: { selector: ':scope', attribute: 'href' }, limit: 2 },
    items,
  ],
  mapping: titles,
  outputSchema: list,
});
const firstTwo = await limitedIndex.run({ url: 'https://i.test/' }, { signal, pages: pagesOf(indexPages) });
assert.deepEqual(firstTwo.data, ['r1', 'r2']);
assert.equal(firstTwo.visited.includes('https://i.test/?p=2'), false);

// `more` pages a JSON request by a counter until it answers null.
const counted = prepareArtifact({
  stamp,
  inputs: { q: { description: 'What to search for.' } },
  request: {
    method: 'GET',
    url: 'https://j.test/search?q={q}&page={page}',
    start: { page: 0 },
    more: {
      $case: {
        branches: [{ when: { $empty: { $ref: '$.document.items' } }, then: { $const: null } }],
        else: { page: { $add: [{ $ref: '$.values.page' }, 1] } },
      },
    },
  },
  policy: policy(),
  stages: [{ kind: 'records', format: 'json' }],
  mapping: fromJson,
  outputSchema: list,
});
const json = (url: string, value: unknown) => source(url, JSON.stringify(value), 'application/json');
const feed = webOf(({ url }) => {
  const page = Number(new URL(url).searchParams.get('page'));
  return json(url, { items: page < 2 ? [`${page}a`, `${page}b`] : [] });
});
const counter = await counted.inspect({ inputs: { q: 'a b&c' } }, { signal, web: feed.web });
assert.deepEqual(counter.result?.data, ['0a', '0b', '1a', '1b']);
assert.deepEqual(
  feed.sent.map((r) => r.url),
  ['https://j.test/search?q=a%20b%26c&page=0', 'https://j.test/search?q=a%20b%26c&page=1', 'https://j.test/search?q=a%20b%26c&page=2'],
);
assert.deepEqual(counter.pages.map((page) => page.values?.page), [0, 1, 2]);

// A JSON page the same as an earlier one ends it.
const stuck = webOf(({ url }) => json(url, { items: ['x'] }));
assert.deepEqual((await counted.run({ inputs: { q: 'x' } }, { signal, web: stuck.web })).data, ['x']);
assert.equal(stuck.sent.length, 2);

// A `more` that fails, or answers what is not a start value, stops the run with MORE.
const notJson = webOf(({ url }) => source(url, html(['h'])));
const countedHtml = prepareArtifact({ ...counted.artifact, stages: [items], mapping: titles });
await assert.rejects(
  countedHtml.run({ inputs: { q: 'x' } }, { signal, web: notJson.web }),
  (error: unknown) => error instanceof WalkError && error.code === 'MORE',
);
const unknownName = prepareArtifact({
  stamp,
  request: { method: 'GET', url: 'https://j.test/{page}', start: { page: 0 }, more: { $const: { cursor: 'x' } } },
  policy: policy(),
  stages: [{ kind: 'records', format: 'json' }],
  mapping: fromJson,
  outputSchema: list,
});
await assert.rejects(
  unknownName.run({}, { signal, web: feed.web }),
  (error: unknown) =>
    error instanceof WalkError && error.code === 'MORE' && /"cursor", which is not a start value/.test(error.message),
);

// POST: a form body, and a JSON body whose standalone "{name}" keeps the value's type while a GraphQL query and a
// value holding braces go as written. Two POSTs to one address with different bodies are two pages.
const graph = prepareArtifact({
  stamp,
  inputs: { term: { description: 'A word.' } },
  request: {
    method: 'POST',
    url: 'https://g.test/graphql',
    headers: { authorization: 'Bearer {term}' },
    body: { json: { query: 'query($n:Int){items(first:$n,after:$after){name}}', variables: { n: '{n}', term: '{term}', after: '{after}' } } },
    start: { n: 2, after: '' },
    more: {
      $case: {
        branches: [{ when: { $empty: { $ref: '$.document.items' } }, then: { $const: null } }],
        else: { after: { $ref: '$.document.cursor' } },
      },
    },
  },
  policy: policy(),
  stages: [{ kind: 'records', format: 'json' }],
  mapping: fromJson,
  outputSchema: list,
});
const posts = webOf((request) => {
  const after = (JSON.parse(request.body ?? '{}') as { variables: { after: string } }).variables.after;
  return json(request.url, after === '' ? { items: ['p1'], cursor: 'c1' } : after === 'c1' ? { items: ['p2'], cursor: 'c2' } : { items: [] });
});
const posted = await graph.run({ inputs: { term: '{after}' } }, { signal, web: posts.web });
assert.deepEqual(posted.data, ['p1', 'p2']);
assert.equal(posts.sent.length, 3);
assert.deepEqual(JSON.parse(posts.sent[0]?.body ?? ''), {
  query: 'query($n:Int){items(first:$n,after:$after){name}}',
  variables: { n: 2, term: '{after}', after: '' },
});
assert.equal(posts.sent[0]?.headers['authorization'], 'Bearer {after}');
assert.equal(posts.sent[0]?.headers['content-type'], 'application/json');
const form = prepareArtifact({
  stamp,
  inputs: { query: { description: 'What to search for.' } },
  request: { method: 'POST', url: 'https://f.test/html/', body: { form: { q: '{query}', kl: 'wt-wt' } } },
  policy: policy(),
  stages: [items],
  mapping: titles,
  outputSchema: list,
});
const formWeb = webOf(({ url }) => source(url, html(['r1', 'r2'])));
assert.deepEqual((await form.run({ inputs: { query: 'haptic feedback' } }, { signal, web: formWeb.web })).data, ['r1', 'r2']);
assert.equal(formWeb.sent[0]?.body, 'q=haptic+feedback&kl=wt-wt');
assert.equal(formWeb.sent[0]?.headers['content-type'], 'application/x-www-form-urlencoded');

// After a POST, 303 is fetched with GET and no body; 307 sends the body again.
const redirected = (status: number) =>
  webOf((request) =>
    request.url === 'https://f.test/html/'
      ? source(request.url, '', 'text/html', status, { location: ['/results'] })
      : source(request.url, html([`${request.method} ${request.body ?? 'none'}`])),
  );
const see = redirected(303);
assert.deepEqual((await form.run({ inputs: { query: 'x' } }, { signal, web: see.web })).data, ['GET none']);
assert.equal(see.sent[1]?.headers['content-type'], undefined);
const temporary = redirected(307);
assert.deepEqual((await form.run({ inputs: { query: 'x' } }, { signal, web: temporary.web })).data, ['POST q=x&kl=wt-wt']);

// The transport sends the profile's headers under the request's own.
const heard: Record<string, string | undefined>[] = [];
const server = createServer((request, response) => {
  heard.push({ agent: request.headers['user-agent'], accept: request.headers['accept'] });
  response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
const web = createWebTransport({ requestHeaders: { 'User-Agent': 'profile', Accept: 'text/html' } });
await web.send({ method: 'GET', url: `http://127.0.0.1:${port}/`, headers: { 'user-agent': 'artifact' }, body: null }, signal);
web.close();
server.close();
assert.deepEqual(heard, [{ agent: 'artifact', accept: 'text/html' }]);

// Refusals, each named.
const refused = (value: Record<string, unknown>, pattern: RegExp) =>
  assert.throws(
    () => prepareArtifact({ stamp, policy: policy(), stages: [items], mapping: titles, outputSchema: list, ...value }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'GRAMMAR' && pattern.test(error.message),
  );
refused({ request: { method: 'GET', url: 'https://x.test/?q={q}' } }, /request\.url: "\{q\}" names no input and no start value/);
refused({ next: more, request: { method: 'GET', url: 'https://x.test/', start: { p: 1 }, more: { $const: null } } }, /an artifact reaches its next page one way/);
refused(
  { next: more, stages: [{ kind: 'records', format: 'json' }], mapping: fromJson },
  /the first stage is not HTML/,
);
refused({ request: { method: 'GET', url: 'https://x.test/', body: { form: {} } } }, /a GET request has no body/);
refused({ request: { method: 'GET', url: 'https://x.test/', headers: { a: 'x\ny' } } }, /request\.headers\.a: a line break/);
refused({ inputs: { q: { description: 'q' } } }, /an artifact without a request has nothing to fill/);
const input = (run: Promise<unknown>, pattern: RegExp) =>
  assert.rejects(run, (error: unknown) => error instanceof WalkError && error.code === 'INPUT' && pattern.test(error.message));
await input(form.run({}, { signal, web: formWeb.web }), /input "query" is missing/);
await input(form.run({ inputs: { query: 'x', other: 'y' } }, { signal, web: formWeb.web }), /"other" is not an input/);
await input(form.run({ url: 'https://f.test/', inputs: { query: 'x' } }, { signal, web: formWeb.web }), /run it without url/);
await input(hn.run({}, { signal, web: formWeb.web }), /run it with url/);
const headed = prepareArtifact({
  stamp,
  inputs: { token: { description: 'A token.' } },
  request: { method: 'GET', url: 'https://x.test/', headers: { authorization: '{token}' } },
  policy: policy(),
  stages: [items],
  mapping: titles,
  outputSchema: list,
});
await input(headed.run({ inputs: { token: 'a\r\nb' } }, { signal, web: formWeb.web }), /a line break once filled/);

// A version 0 artifact means the same at version 1.
assert.deepEqual(
  prepareArtifact({ stamp: { 'nisc.haptic': 0, 'nisc.prism': 3 }, policy: policy(), stages: [items], mapping: titles, outputSchema: list }).artifact.stamp,
  { 'nisc.haptic': 1, 'nisc.prism': 3 },
);

// The three examples in ARTIFACTS.md prepare and run as it says, on pages shaped like the sites'.
const doc = await readFile(new URL('../ARTIFACTS.md', import.meta.url), 'utf8');
const section = doc.slice(doc.indexOf('### Requests, inputs and more pages'));
const [hnExample, devExample, searchExample] = [...section.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)].map(
  (match) => prepareArtifact(JSON.parse(match[1] ?? 'null')),
);
assert.ok(hnExample && devExample && searchExample);
const story = (n: number) =>
  `<tr class="athing" id="${n}"><td><span class="titleline"><a href="https://s.test/${n}">Story ${n}</a></span></td></tr>`;
const hnPage = (from: number) =>
  `<table>${[0, 1].map((i) => story(from + i)).join('')}</table><a class="morelink" href="?p=${from / 2 + 2}">More</a>`;
const hnPages = {
  'https://news.ycombinator.com/': source('https://news.ycombinator.com/', hnPage(0)),
  'https://news.ycombinator.com/?p=2': source('https://news.ycombinator.com/?p=2', hnPage(2)),
  'https://news.ycombinator.com/?p=3': source('https://news.ycombinator.com/?p=3', hnPage(4)),
};
const hnRun = await hnExample.run({ url: 'https://news.ycombinator.com/' }, { signal, pages: pagesOf(hnPages) });
assert.equal((hnRun.data as unknown[]).length, 6);
assert.deepEqual((hnRun.data as unknown[])[5], { title: 'Story 5', link: 'https://s.test/5' });
assert.equal(hnRun.limited, true);
const dev = webOf(({ url }) => {
  const page = Number(new URL(url).searchParams.get('page'));
  return json(url, { result: page < 2 ? [{ title: `t${page}`, path: `/u/t${page}` }] : [] });
});
assert.deepEqual((await devExample.run({}, { signal, web: dev.web })).data, [
  { title: 't0', link: 'https://dev.to/u/t0' },
  { title: 't1', link: 'https://dev.to/u/t1' },
]);
const ddg = webOf(({ url }) =>
  source(url, '<div class="result"><a class="result__a" href="https://r.test/">R</a><a class="result__snippet">S</a></div>'),
);
assert.deepEqual((await searchExample.run({ inputs: { query: 'haptic feedback' } }, { signal, web: ddg.web })).data, [
  { title: 'R', link: 'https://r.test/', snippet: 'S' },
]);
assert.equal(ddg.sent[0]?.body, 'q=haptic+feedback');

console.log('interactions: next links, more, stops, index paging, POST bodies, redirects, headers, refusals, examples');
