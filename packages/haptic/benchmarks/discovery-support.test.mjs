import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  authorUsageCoverage,
  assertResultContract,
  runConcurrent,
  gradeDiscoveryResult,
  runReplay,
  readRecordedModelOutput,
} from './discovery-support.mjs';
import { RunControl } from '../dist/index.js';
import { createWebOperations } from '../dist/operations/index.js';
import { captureBody } from '../dist/operations/http-source.js';
import { mutateXmlSource } from './xml-fixtures.mjs';
import { mutateHtmlSource } from './html-fixtures.mjs';

test('Schema-shaped news grading accepts requested field data and rejects missing or unwanted content', async () => {
  const suite = JSON.parse(await readFile(new URL('./discovery-suite.json', import.meta.url)));
  const task = suite.cases.find((entry) => entry.id === 'django-news');
  assert(task?.outputSchema && task.expectedFields && task.expectedMapping);
  const body = captureBody(
    Buffer.from(
      '<nav>Other headline</nav><ul class="list-news"><li><h2> First </h2><div class="byline">An author and date</div><p> Intro one </p><div><a>Read more</a></div></li><li><h2>Second</h2><p>Intro two</p></li></ul><footer>Other text</footer>',
    ),
  );
  const source = {
    url: task.url,
    status: 200,
    headers: { 'content-type': ['text/html'] },
    body,
    encoded: body,
  };
  const data = [
    { headline: 'First', intro: 'Intro one' },
    { headline: 'Second', intro: 'Intro two' },
  ];
  const web = createWebOperations();
  const grade = (value) =>
    gradeDiscoveryResult(task, { ...task.expectedMetadata, data: value }, [source], web.operations);
  try {
    assert((await grade(data)).exact);
    assert(!(await grade([])).exact);
    assert(!(await grade([{ headline: 'Latest news', intro: 'Homepage metadata' }])).exact);
    assert(!(await grade(data.slice(0, 1))).exact);
    assert(!(await grade([{ headline: 'First', intro: 'An author and date' }, data[1]])).exact);
    assert(!(await grade([{ ...data[0], byline: 'An author and date' }, data[1]])).exact);
    assert(!(await grade([{ headline: 'First' }, data[1]])).exact);
  } finally {
    web.close();
  }
});

test('Structured-record grading uses independent fields and detects frozen values and omitted records', async () => {
  const web = createWebOperations(),
    url = 'https://fixture.invalid/records';
  const body = captureBody(
    Buffer.from(
      '<main><section class="record"><h2>Original</h2><a href="/one">One</a></section></main>',
    ),
  );
  const source = {
    url,
    status: 200,
    headers: { 'content-type': ['text/html'] },
    body,
    encoded: body,
  };
  const task = {
    url,
    expectedSelector: '.record',
    expectedFields: { label: { selector: 'h2', attribute: null, minimum: 1, maximum: 1 } },
    outputSchema: { type: 'array' },
    expectedMetadata: { visited: [url], limited: false },
    expectedMapping: {
      $map: {
        over: { $ref: '$.input.pages[0].items' },
        as: 'record',
        body: { $get: { from: { $var: 'record' }, path: ['fields', 'label', 0] } },
      },
    },
  };
  try {
    const changed = mutateHtmlSource(source, {
      changes: [{ selector: 'h2', value: 'Changed' }],
      prepend: [{ selector: 'main', html: '<section class="record"><h2>Added</h2></section>' }],
    });
    const emptyBody = captureBody(Buffer.from('<main></main>'));
    assert(
      (
        await gradeDiscoveryResult(
          task,
          { data: [], ...task.expectedMetadata },
          [{ ...source, body: emptyBody, encoded: emptyBody }],
          web.operations,
        )
      ).exact,
    );
    assert(
      (
        await gradeDiscoveryResult(
          task,
          { data: ['Added', 'Changed'], ...task.expectedMetadata },
          [changed],
          web.operations,
        )
      ).exact,
    );
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { data: ['Original'], ...task.expectedMetadata },
          [changed],
          web.operations,
        )
      ).exact,
    );
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { data: ['Changed'], ...task.expectedMetadata },
          [changed],
          web.operations,
        )
      ).exact,
    );
  } finally {
    web.close();
  }
});

test('Reference traversal grading follows independent XML links and checks downloaded bytes', async () => {
  const web = createWebOperations();
  const root = 'https://fixture.invalid/feed';
  const source = (url, type, text) => {
    const body = captureBody(Buffer.from(text));
    return { url, status: 200, headers: { 'content-type': [type] }, body, encoded: body };
  };
  const sources = [
    source(root, 'application/xml', '<feed><entry><uri>/article</uri></entry></feed>'),
    source(
      'https://fixture.invalid/article',
      'text/html',
      '<a class="pdf" href="/file.pdf">PDF</a>',
    ),
    source('https://fixture.invalid/file.pdf', 'application/pdf', '%PDF-1.7\noriginal'),
  ];
  const task = {
    url: root,
    maxPages: 4,
    maxResources: 4,
    referenceTraversal: {
      format: 'xml',
      rule: { selector: '/feed/entry', namespaces: {}, fields: { href: 'string(uri)' } },
      mapping: {
        $map: {
          over: { $ref: '$.input.items' },
          as: 'row',
          body: { $get: { from: { $var: 'row' }, path: ['href'] } },
        },
      },
    },
    expectedDestinationSelector: 'a.pdf',
    resourceReference: ['attributes', 'href'],
  };
  const result = {
    pages: [],
    visited: [root, 'https://fixture.invalid/article'],
    limited: false,
    resources: { items: [{ source: sources[2] }], limited: false },
  };
  try {
    assert((await gradeDiscoveryResult(task, result, sources, web.operations)).exact);
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { ...result, resources: { items: [], limited: false } },
          sources,
          web.operations,
        )
      ).exact,
    );
    const wrong = structuredClone(result);
    wrong.resources.items[0].source.body = captureBody(Buffer.from('%PDF-1.7\nwrong'));
    assert(!(await gradeDiscoveryResult(task, wrong, sources, web.operations)).exact);
    assert(
      !(await gradeDiscoveryResult(task, { ...result, visited: [root] }, sources, web.operations))
        .exact,
    );
    // A missing expected acquisition is wrong, not unavailable grading evidence.
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { ...result, visited: [root] },
          sources.slice(0, 1),
          web.operations,
        )
      ).exact,
    );
    assert(!(await gradeDiscoveryResult(task, result, sources.slice(0, 1), web.operations)).exact);
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { ...result, resources: { items: [], limited: false } },
          sources.slice(0, 2),
          web.operations,
        )
      ).exact,
    );
    const redirect = { ...sources[2], status: 302, headers: { location: ['/uncaptured.pdf'] } };
    assert(
      !(
        await gradeDiscoveryResult(task, result, [...sources.slice(0, 2), redirect], web.operations)
      ).exact,
    );
    await assert.rejects(
      gradeDiscoveryResult(task, result, [], web.operations),
      /Missing reference HTTP response/,
    );
  } finally {
    web.close();
  }
});

test('HTML mutation fixtures preserve originals and independent grading excludes unrelated offers', async () => {
  const web = createWebOperations();
  const url = 'https://fixture.invalid/product';
  const body = captureBody(
    Buffer.from(
      '<main id="record"><meta data-kind="amount" content="7.99"><meta data-kind="unit" content="EUR"></main>',
    ),
  );
  const source = {
    url,
    status: 200,
    headers: { 'content-type': ['text/html'] },
    encoded: body,
    body,
  };
  const before = structuredClone(source);
  const task = {
    id: 'html',
    url,
    expectedSelector: '#record meta',
    outputSchema: { type: 'string' },
    expectedMetadata: { visited: [url], limited: false },
    expectedMapping: {
      $get: {
        from: { $ref: '$.input' },
        path: ['pages', 0, 'items', 0, 'attributes', 'content'],
        fallback: null,
      },
    },
  };
  const changed = mutateHtmlSource(source, {
    changes: [{ selector: '#record [data-kind=amount]', attribute: 'content', value: '12.49' }],
    prepend: [
      { selector: 'body', html: '<aside><meta data-kind="amount" content="0.99"></aside>' },
    ],
  });
  try {
    assert(
      (
        await gradeDiscoveryResult(
          task,
          { data: '12.49', ...task.expectedMetadata },
          [changed],
          web.operations,
        )
      ).exact,
    );
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { data: '0.99', ...task.expectedMetadata },
          [changed],
          web.operations,
        )
      ).exact,
    );
    const absent = mutateHtmlSource(source, { remove: ['#record meta'] });
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { data: '7.99', ...task.expectedMetadata },
          [absent],
          web.operations,
        )
      ).exact,
    );
    await assert.rejects(
      gradeDiscoveryResult(
        { ...task, referenceUnavailable: 'source unavailable' },
        {},
        [source],
        web.operations,
      ),
      /source unavailable/,
    );
    assert.deepEqual(source, before);
  } finally {
    web.close();
  }
});

test('XML fixture mutations and grading preserve namespace identity and detect wrong data', async () => {
  const web = createWebOperations();
  const url = 'https://fixture.invalid/xml';
  const body = captureBody(
    Buffer.from(
      '<root xmlns="urn:rows"><row active="yes"><value>Original</value></row><row active="no"><value>Excluded</value></row></root>',
    ),
  );
  const source = {
    url,
    status: 200,
    headers: { 'content-type': ['application/xml'] },
    encoded: body,
    body,
  };
  const before = structuredClone(source);
  const task = {
    id: 'xml',
    url,
    expectedFormat: 'xml',
    expectedMetadata: { visited: [url], limited: false },
    expectedMapping: { $ref: '$.input.items' },
    expectedRule: {
      selector: '/x:root/x:row[@active="yes"]',
      namespaces: { x: 'urn:rows' },
      fields: { value: 'string(x:value)' },
    },
  };
  const variants = [
    [
      {
        namespaces: { x: 'urn:rows' },
        changes: [{ select: '/x:root/x:row/x:value', text: 'Changed' }],
      },
      [{ value: 'Changed' }],
    ],
    [
      {
        namespaces: { x: 'urn:rows' },
        append: [
          {
            select: '/x:root',
            xml: '<row xmlns="urn:rows" active="yes"><value>Added</value></row>',
          },
          {
            select: '/x:root',
            xml: '<row xmlns="urn:foreign" active="yes"><value>Wrong namespace</value></row>',
          },
        ],
      },
      [{ value: 'Original' }, { value: 'Added' }],
    ],
    [{ namespace: { from: 'urn:rows', to: 'urn:rows', prefix: 'new' } }, [{ value: 'Original' }]],
    [{ namespace: { from: 'urn:rows', to: 'urn:other', prefix: 'new' } }, []],
    [{ namespaces: { x: 'urn:rows' }, remove: ['/x:root/x:row[@active="yes"]'] }, []],
  ];
  try {
    for (const [variant, expected] of variants) {
      const mutated = mutateXmlSource(source, variant, AbortSignal.timeout(30000));
      const result = await gradeDiscoveryResult(
        task,
        { data: expected, ...task.expectedMetadata },
        [mutated],
        web.operations,
      );
      assert(result.exact);
      assert(
        !(
          await gradeDiscoveryResult(
            task,
            { data: [{ value: 'wrong' }], ...task.expectedMetadata },
            [mutated],
            web.operations,
          )
        ).exact,
      );
    }
    assert.deepEqual(source, before);
  } finally {
    web.close();
  }
});

test('JSON grading uses original parsed values and accepts genuine empty results', async () => {
  const web = createWebOperations();
  const url = 'https://fixture.invalid/data';
  const task = {
    id: 'json',
    url,
    expectedFormat: 'json',
    expectedMapping: { $ref: '$.input.document.rows' },
    expectedMetadata: { visited: [url], limited: false },
  };
  const source = (document) => {
    const body = captureBody(Buffer.from(JSON.stringify(document)));
    return {
      url,
      status: 200,
      headers: { 'content-type': ['application/json'] },
      encoded: body,
      body,
    };
  };
  try {
    assert(
      (
        await gradeDiscoveryResult(
          task,
          { data: [1], ...task.expectedMetadata },
          [source({ rows: [1] })],
          web.operations,
        )
      ).exact,
    );
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { data: [1], ...task.expectedMetadata },
          [source({ rows: [2] })],
          web.operations,
        )
      ).exact,
    );
    assert(
      (
        await gradeDiscoveryResult(
          task,
          { data: [], ...task.expectedMetadata },
          [source({ rows: [] })],
          web.operations,
        )
      ).exact,
    );
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { data: [], visited: [], limited: false },
          [source({ rows: [] })],
          web.operations,
        )
      ).exact,
    );
  } finally {
    web.close();
  }
});

test('shaped data is graded from independent source elements, not returned records', async () => {
  const body = captureBody(Buffer.from('<main><a href="/a">Alpha</a><a href="/b">Beta</a></main>'));
  const source = {
    url: 'https://example.test/list',
    status: 200,
    headers: {},
    encoded: body,
    body,
  };
  const task = {
    id: 'shaped',
    url: source.url,
    expectedSelector: 'main a',
    outputSchema: { type: 'array' },
    expectedMetadata: { visited: [source.url], limited: false },
    expectedMapping: {
      $map: {
        over: { $ref: '$.input.pages[0].items' },
        as: 'row',
        body: { $get: { from: { $var: 'row' }, path: ['text'] } },
      },
    },
  };
  const web = createWebOperations();
  const envelope = (data) => ({ data, visited: [source.url], limited: false });
  try {
    assert(
      (await gradeDiscoveryResult(task, envelope(['Alpha', 'Beta']), [source], web.operations))
        .exact,
    );
    assert(
      !(await gradeDiscoveryResult(task, envelope(['Alpha']), [source], web.operations)).exact,
    );
    assert(
      !(await gradeDiscoveryResult(task, envelope(['Beta', 'Alpha']), [source], web.operations))
        .exact,
    );
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { ...envelope(['Invented']), pages: [{ items: [{ text: 'Invented' }] }] },
          [source],
          web.operations,
        )
      ).exact,
    );
    assert(
      (
        await gradeDiscoveryResult(
          { ...task, expectedMapping: null },
          envelope(null),
          [source],
          web.operations,
        )
      ).exact,
    );
    const { expectedMapping: _mapping, ...missing } = task;
    await assert.rejects(
      gradeDiscoveryResult(missing, { data: [] }, [source], web.operations),
      /independent expectedMapping/,
    );
    const limitedTask = {
      ...task,
      expectedMapping: { $ref: '$.input.limited' },
      expectedMetadata: { visited: [source.url], limited: true },
    };
    assert(
      (
        await gradeDiscoveryResult(
          limitedTask,
          { ...envelope(true), limited: true },
          [source],
          web.operations,
        )
      ).exact,
    );
    assert(
      !(await gradeDiscoveryResult(limitedTask, envelope(true), [source], web.operations)).exact,
    );
  } finally {
    web.close();
  }
});

test('resource grading checks downloaded bytes and rejects links-only or unwanted fetching', async () => {
  const source = (url, bytes, contentType) => ({
    url,
    status: 200,
    headers: { 'content-type': [contentType] },
    encoded: captureBody(bytes),
    body: captureBody(bytes),
  });
  const listing = source(
    'https://example.test/list',
    Buffer.from('<main><a href="/file">File</a></main>'),
    'text/html',
  );
  const file = source('https://example.test/file', Buffer.from('%PDF-bytes'), 'application/pdf');
  const web = createWebOperations();
  try {
    const selection = await web.operations['html.select'].run(
      { source: listing, selector: 'main a' },
      { signal: new AbortController().signal },
    );
    const task = {
      id: 'resources',
      url: listing.url,
      expectedSelector: 'main a',
      resourceReference: ['attributes', 'href'],
      resourcePrefixBase64: Buffer.from('%PDF-').toString('base64'),
      checkSelection: false,
    };
    const value = {
      pages: [{ url: listing.url, ...selection }],
      resources: { items: [{ source: file }], limited: false },
    };
    assert((await gradeDiscoveryResult(task, value, [listing, file], web.operations)).exact);
    assert(
      (
        await gradeDiscoveryResult(
          { ...task, checkSelection: false },
          { ...value, pages: [] },
          [listing, file],
          web.operations,
        )
      ).exact,
    );
    assert(
      !(await gradeDiscoveryResult(task, { pages: value.pages }, [listing, file], web.operations))
        .exact,
    );
    const damaged = structuredClone(value);
    damaged.resources.items[0].source.body = captureBody(Buffer.from('incorrect'));
    assert(!(await gradeDiscoveryResult(task, damaged, [listing, file], web.operations)).exact);
    const { resourceReference: _reference, ...selectOnly } = task;
    selectOnly.expectedMapping = [];
    selectOnly.expectedMetadata = { visited: [listing.url], limited: false };
    assert(!(await gradeDiscoveryResult(selectOnly, value, [listing, file], web.operations)).exact);
    assert(
      (
        await gradeDiscoveryResult(
          { ...task, maxResources: 0 },
          { pages: value.pages, resources: { items: [], limited: true } },
          [listing],
          web.operations,
        )
      ).exact,
    );
  } finally {
    web.close();
  }
});

test('recorded provider output preserves fragmented content and rejects corrupt evidence', () => {
  const body =
    [
      { choices: [{ index: 0, delta: { content: '{"data":' } }] },
      { choices: [{ index: 0, delta: { content: '{"selector":"p","links":null}}' } }] },
      { choices: [], usage: { prompt_tokens: 20, completion_tokens: 5 } },
    ]
      .map((item) => 'data: ' + JSON.stringify(item))
      .join('\n\n') + '\n\ndata: [DONE]\n';
  assert.deepEqual(readRecordedModelOutput(body).data, { selector: 'p', links: null });
  assert.throws(() => readRecordedModelOutput('data: {broken'), SyntaxError);
  assert.throws(() => readRecordedModelOutput('data: [DONE]'), SyntaxError);
});

test('replay records control failures without hiding unexpected errors', async () => {
  const deadline = await runReplay(
    {
      run: async () => {
        throw new RunControl('DEADLINE', 'deadline');
      },
    },
    {},
  );
  assert.deepEqual(deadline, {
    status: 'failed',
    value: null,
    error: { code: 'DEADLINE', message: 'deadline' },
  });
  await assert.rejects(
    runReplay(
      {
        run: async () => {
          throw new Error('audit storage failed');
        },
      },
      {},
    ),
    /audit storage failed/,
  );
});

test('usage coverage never presents missing or failed-request usage as complete', () => {
  assert.equal(authorUsageCoverage([]).fullyReported, false);
  const call = { provider: '120b', usage: { prompt_tokens: 10, completion_tokens: 2 } };
  assert.equal(authorUsageCoverage([{ calls: [call], sdkUsage: [] }]).fullyReported, false);
  assert.equal(
    authorUsageCoverage([{ calls: [call], sdkUsage: [{ reported: true }] }]).fullyReported,
    true,
  );
  const result = authorUsageCoverage([
    { calls: [call, { provider: '120b', status: 429 }], sdkUsage: [{ reported: true }] },
  ]);
  assert.equal(result.providerRequests, 2);
  assert.equal(result.providerRequestsWithUsage, 1);
  assert.equal(result.fullyReported, false);
  assert.equal(
    authorUsageCoverage([{ calls: [{ provider: '120b', dispatched: false }] }]).providerRequests,
    0,
  );
});

test('selector-only benchmarks cannot claim final-answer accuracy', () => {
  assert.throws(
    () => assertResultContract({ id: 'selection-only', expectedSelector: 'h1' }),
    /independent expectedMapping/,
  );
  assert.throws(
    () => assertResultContract({ id: 'schema-only', outputSchema: { type: 'array' } }),
    /independent expectedMapping/,
  );
  assert.doesNotThrow(() =>
    assertResultContract({
      id: 'generated-schema',
      expectedMapping: [],
      expectedMetadata: { visited: [], limited: false },
    }),
  );
});

test('linked-page grading derives expected URLs independently and rejects missing or wrong pages', async () => {
  const web = createWebOperations();
  const source = (url, html, status = 200, headers = {}) => ({
    url,
    status,
    headers: { 'content-type': ['text/html'], ...headers },
    encoded: captureBody(Buffer.from(html)),
    body: captureBody(Buffer.from(html)),
  });
  const root = source(
    'https://fixture.invalid/',
    '<base href="/posts/"><main><a href="one#first">One</a><a href="one#second">One again</a><a href="two">Two</a></main>',
  );
  const one = source('https://fixture.invalid/posts/one', '<h1>First</h1>');
  const redirect = source('https://fixture.invalid/posts/two', '', 301, {
    location: ['../other/two'],
  });
  const two = source('https://fixture.invalid/other/two', '<h1>Second</h1>');
  const task = {
    id: 'fixture',
    url: root.url,
    expectedSelector: 'main a',
    expectedDestinationSelector: 'h1',
    expectedMapping: {
      $map: {
        over: { $ref: '$.input.pages' },
        as: 'page',
        body: { $get: { from: { $var: 'page' }, path: ['items', 0, 'text'] } },
      },
    },
    expectedMetadata: { visited: [root.url, one.url, redirect.url], limited: false },
  };
  const result = { data: ['First', 'Second'], ...task.expectedMetadata };
  try {
    assert(
      (await gradeDiscoveryResult(task, result, [root, one, redirect, two], web.operations)).exact,
    );
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { ...result, resources: { items: [{ source: one }], limited: false } },
          [root, one, redirect, two],
          web.operations,
        )
      ).exact,
    );
    assert(!(await gradeDiscoveryResult(task, result, [root, one], web.operations)).exact);
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { ...result, data: [...result.data].reverse() },
          [root, one, redirect, two],
          web.operations,
        )
      ).exact,
    );
    assert(
      !(
        await gradeDiscoveryResult(
          task,
          { ...result, data: [result.data[0]] },
          [root, one, redirect, two],
          web.operations,
        )
      ).exact,
    );
  } finally {
    web.close();
  }
});

test('bounded workers keep trial context and ordered results despite overlapping calls', async () => {
  const context = new AsyncLocalStorage();
  let active = 0,
    peak = 0;
  const results = await runConcurrent([0, 1, 2, 3, 4, 5], 4, (id) =>
    context.run(id, async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, (6 - id) * 3));
      assert.equal(context.getStore(), id);
      active--;
      return id;
    }),
  );
  assert.equal(peak, 4);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
});

test('worker failure drains in-flight work and prevents further dispatch', async () => {
  const started = [],
    finished = [];
  await assert.rejects(
    runConcurrent([0, 1, 2, 3, 4], 2, async (id) => {
      started.push(id);
      if (id === 0) throw new Error('fixture failure');
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished.push(id);
    }),
    /fixture failure/,
  );
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(finished, [1]);
});
