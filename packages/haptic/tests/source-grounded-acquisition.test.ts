import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { defineOperation } from '../src/engine/operation.js';
import type { JsonValue } from '../src/engine/contracts.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';

const origin = 'https://acquisition.invalid';
const start = origin + '/root';
const proposal = (candidate: JsonValue): JsonValue => ({ action: 'propose', candidate });
const plainTask = { requiresNavigation: false, resultFlow: null };
const resourceFlow = { id: 'fetch-resources', revision: 1 };
const schema = { type: 'array', items: { type: 'string' } };
const select = (selector: string | null, links: string | null = null) => ({
  preconditions: [],
  selector,
  links,
  fields: null,
  result: null,
});
const htmlProgram = {
  $map: {
    over: { $ref: '$.input.records' },
    as: 'record',
    body: { $get: { from: { $var: 'record' }, path: ['text'] } },
  },
};
const valueOf = (value: unknown) =>
  z
    .object({ data: z.json(), visited: z.array(z.string()), limited: z.boolean() })
    .loose()
    .parse(value);
type Page = { text: string; media?: string; status?: number; location?: string };
type ModelRequest = {
  name: string;
  input: { messages: { role: string; content: string }[]; settings: Record<string, JsonValue> };
};

const fixture = async (options: {
  pages: (url: string) => Page;
  replies: Record<string, JsonValue[]>;
  profile?: Record<string, unknown>;
  onModel?: (request: ModelRequest) => void;
}) => {
  const host = createWebOperations();
  const settings = { ...discoveryProfile, ...options.profile };
  const gets: string[] = [];
  const models: ModelRequest[] = [];
  const events: JsonValue[] = [];
  const queues = Object.fromEntries(
    Object.entries(options.replies).map(([name, entries]) => [name, [...entries]]),
  );
  const http = defineOperation({
    input: z.object({ url: z.string() }).strict(),
    output: HttpSourceSchema,
    run(input) {
      gets.push(input.url);
      const page = options.pages(input.url);
      const body = captureBody(Buffer.from(page.text));
      return {
        url: input.url,
        status: page.status ?? 200,
        headers: {
          'content-type': [page.media ?? 'text/html'],
          ...(page.location ? { location: [page.location] } : {}),
        },
        body,
        encoded: body,
      };
    },
  });
  const mechanical = { ...host.operations, 'http.get': http };
  const discovery = createDiscoveryOperations({
    author: { apiKey: 'offline-unused' },
    profile: settings,
    mechanical: { 'http.get': http },
    record: (event) => events.push(event),
  });
  const operations = { ...discovery.operations };
  for (const name of [
    'task.declare',
    'result.contract',
    'result.review',
    'author.html',
    'author.xml.selection',
    'author.output',
    'author.reference',
  ]) {
    operations[name] = defineOperation({
      input: z
        .object({
          messages: z.array(z.object({ role: z.string(), content: z.string() })),
          settings: z.record(z.string(), z.json()),
        })
        .loose(),
      output: z.json(),
      run(input) {
        const request = { name, input: structuredClone(input) };
        models.push(request);
        options.onModel?.(request);
        const decision = queues[name]?.shift();
        assert.notEqual(
          decision,
          undefined,
          'Unexpected controlled model invocation: ' +
            name +
            '\n' +
            JSON.stringify(input.messages.slice(-3)),
        );
        return {
          ok: true,
          decision: decision ?? null,
          error: null,
          meta: {
            steps: 1,
            elapsedMs: 1,
            outputRetries: 0,
            strategy: 'emit',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false },
          },
          rawSources: [],
        };
      },
    });
  }
  const prepared = await prepareArtifact(discoveryWorkflow, operations, discovery.limits);
  const run = async (input: Record<string, unknown> = {}, signal?: AbortSignal) =>
    prepared.run(
      Object.fromEntries(
        Object.entries({
          url: start,
          instruction: 'Read the requested record labels.',
          outputSchema: schema,
          ...input,
        }).filter(([, value]) => value !== undefined),
      ),
      { signal },
    );
  return {
    gets,
    models,
    events,
    run,
    settings,
    async replay(artifact: JsonValue, url = start) {
      const count = models.length;
      const outcome = await (
        await prepareArtifact(artifact, mechanical, discovery.limits)
      ).run({ url });
      assert.equal(models.length, count, 'Mechanical replay cannot call a model');
      return outcome;
    },
    close() {
      discovery.close();
      host.close();
    },
  };
};
const published = (outcome: unknown) => {
  const result = z
    .object({
      status: z.literal('completed'),
      value: z.object({ status: z.literal('ready'), artifact: z.json() }).loose(),
    })
    .parse(outcome);
  return result.value;
};
const unresolved = (outcome: unknown) => {
  const result = z
    .object({
      status: z.literal('completed'),
      value: z
        .object({ status: z.literal('unresolved'), artifact: z.null(), reason: z.string().min(1) })
        .loose(),
    })
    .parse(outcome);
  return result.value;
};
const verdict = { accepted: true, reason: 'Controlled source-supported test verdict.' };
const assertReviewScope = (visited: number, limited: boolean) => (request: ModelRequest) => {
  if (request.name !== 'result.review') return;
  const message = request.input.messages.find((entry) => entry.content.startsWith('LIMIT CONTEXT'));
  assert(message);
  const context = z
    .object({ visited: z.array(z.string()), limited: z.boolean() })
    .loose()
    .parse(JSON.parse(message.content.split('\n').slice(1).join('\n')));
  assert.equal(
    context.visited.length,
    visited,
    'Review scope must match actual current-artifact target acquisition',
  );
  assert.equal(context.limited, limited, 'Review scope must retain complete-trial limitation');
};
const htmlReplies = (): Record<string, JsonValue[]> => ({
  'task.declare': [plainTask],
  'author.html': [proposal(select('main p'))],
  'author.output': [htmlProgram],
  'result.review': [verdict],
});
let groups = 0;
const check = async (name: string, run: () => Promise<void>) => {
  await run();
  groups++;
  console.log('[pass] grounded acquisition: ' + name);
};

await check(
  'caller-only permission ceilings and unsupported overrides are admitted before HTTP',
  async () => {
    for (const [task, input] of [
      [{ requiresNavigation: true, resultFlow: null }, {}],
      [
        { requiresNavigation: true, resultFlow: null },
        { allowLinkFollowing: true, linkDepth: 0 },
      ],
      [{ requiresNavigation: false, resultFlow: resourceFlow }, {}],
      [
        { requiresNavigation: false, resultFlow: { id: 'unavailable', revision: 1 } },
        { allowResourceFetching: true },
      ],
    ] as const) {
      const test = await fixture({
        pages: () => ({ text: '<main><p>Value</p></main>' }),
        replies: {
          'task.declare': Array.from({ length: discoveryProfile.author.maxModelSteps }, () => task),
        },
      });
      try {
        unresolved(await test.run(input));
        assert.deepEqual(test.gets, []);
        assert.equal(test.models.length, discoveryProfile.author.maxModelSteps);
        assert(test.models.every((model) => model.name === 'task.declare'));
      } finally {
        test.close();
      }
    }
    for (const input of [
      { profile: {} },
      { maxPages: 0 },
      { linkDepth: -1 },
      { maxResources: -1 },
      { asOf: 'November' },
    ]) {
      const test = await fixture({ pages: () => ({ text: '' }), replies: {} });
      try {
        await assert.rejects(test.run(input));
        assert.deepEqual(test.gets, []);
        assert.deepEqual(test.models, []);
      } finally {
        test.close();
      }
    }
  },
);

await check('explicit false/zero overrides remain below enabled profile defaults', async () => {
  const test = await fixture({
    pages: () => ({ text: '<main><p>Value</p></main>' }),
    replies: htmlReplies(),
    profile: {
      traversal: { ...discoveryProfile.traversal, allowLinkFollowing: true, linkDepth: 8 },
      resources: { ...discoveryProfile.resources, allowResourceFetching: true, maxResources: 8 },
    },
  });
  try {
    const result = published(
      await test.run({
        allowLinkFollowing: false,
        linkDepth: 0,
        allowResourceFetching: false,
        maxResources: 0,
      }),
    );
    assert.deepEqual(valueOf((await test.replay(result.artifact)).value).data, ['Value']);
    assert.equal(new Set(test.gets).size, 1);
    const artifact = z
      .object({
        data: z
          .object({
            canFollow: z.boolean(),
            policy: z.object({ allowLinkFollowing: z.boolean(), linkDepth: z.number() }),
            resources: z.object({ allowResourceFetching: z.boolean(), maxResources: z.number() }),
          })
          .loose(),
      })
      .parse(result.artifact);
    assert.equal(artifact.data.canFollow, false);
    assert.equal(artifact.data.policy.linkDepth, 0);
    assert.equal(artifact.data.resources.allowResourceFetching, false);
    assert.equal(artifact.data.resources.maxResources, 0);
  } finally {
    test.close();
  }
});

await check(
  'five destinations and two link depths retain BFS, shared bounds, aliases and AI-free changed links',
  async () => {
    let names = ['a', 'b', 'c', 'd', 'e'];
    const pages = (url: string): Page => {
      const path = new URL(url).pathname;
      if (path === '/root')
        return {
          text:
            '<main>' +
            names.map((name) => `<a data-next href="/branch/${name}">${name}</a>`).join('') +
            '<a data-next href="/branch/a#duplicate">Repeat</a><a href="/menu">Menu</a></main>',
        };
      if (path.startsWith('/branch/'))
        return {
          text: `<main><p>${path}</p><a data-next href="/leaf/${path.split('/').pop()}">Leaf</a><a data-next href="/root">Cycle</a></main>`,
        };
      if (path.startsWith('/leaf/')) return { text: `<main><p>${path}</p></main>` };
      throw new Error('Unexpected BFS target ' + url);
    };
    const replies = htmlReplies();
    replies['task.declare'] = [{ requiresNavigation: true, resultFlow: null }];
    replies['author.html'] = [
      proposal(select(null, 'main a[data-next]')),
      proposal(select('main p', 'main a[data-next]')),
      proposal(select('main p')),
    ];
    const test = await fixture({ pages, replies });
    try {
      const result = published(
        await test.run({ allowLinkFollowing: true, linkDepth: 2, maxPages: 11 }),
      );
      const initial = valueOf((await test.replay(result.artifact)).value);
      assert.deepEqual(initial.visited, [
        start,
        ...names.map((n) => origin + '/branch/' + n),
        ...names.map((n) => origin + '/leaf/' + n),
      ]);
      assert.equal(initial.limited, false);
      assert.equal(new Set(test.gets.slice(0, 11)).size, 11);
      names = ['x', 'y'];
      const changed = valueOf((await test.replay(result.artifact)).value);
      // The deliberately retained /branch/a link is a distinct current source value.
      assert.deepEqual(changed.visited, [
        start,
        origin + '/branch/x',
        origin + '/branch/y',
        origin + '/branch/a',
        origin + '/leaf/x',
        origin + '/leaf/y',
        origin + '/leaf/a',
      ]);
      assert.equal(z.array(z.string()).parse(changed.data).length, 6);
    } finally {
      test.close();
    }
  },
);

await check(
  'page ceiling is shared across a complete frontier and limited is explicit',
  async () => {
    const replies = htmlReplies();
    replies['task.declare'] = [{ requiresNavigation: true, resultFlow: null }];
    replies['author.html'] = [proposal(select(null, 'main a')), proposal(select('main p'))];
    const test = await fixture({
      pages: (url) => ({
        text:
          url === start
            ? '<main><a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a></main>'
            : '<main><p>' + new URL(url).pathname + '</p></main>',
      }),
      replies,
      onModel: assertReviewScope(3, true),
    });
    try {
      const result = published(
        await test.run({ allowLinkFollowing: true, linkDepth: 1, maxPages: 3 }),
      );
      const value = valueOf((await test.replay(result.artifact)).value);
      assert.equal(value.visited.length, 3);
      assert.equal(value.limited, true);
      assert.deepEqual(value.data, ['/one', '/two']);
      assert.equal(z.object({ limited: z.boolean() }).parse(result).limited, true);
    } finally {
      test.close();
    }
  },
);

await check(
  'redirect hops do not consume target slots and aliased final documents are selected once',
  async () => {
    const replies = htmlReplies();
    replies['task.declare'] = [{ requiresNavigation: true, resultFlow: null }];
    replies['author.html'] = [proposal(select(null, 'main a')), proposal(select('main p'))];
    const test = await fixture({
      pages: (url) => {
        const path = new URL(url).pathname;
        if (path === '/root')
          return { text: '<main><a href="/alias-one">One</a><a href="/alias-two">Two</a></main>' };
        if (path.startsWith('/alias-')) return { text: '', status: 302, location: '/same' };
        assert.equal(path, '/same');
        return { text: '<main><p>Shared</p></main>' };
      },
      replies,
    });
    try {
      const result = published(
        await test.run({ allowLinkFollowing: true, linkDepth: 1, maxPages: 3 }),
      );
      const before = test.gets.length;
      const replay = valueOf((await test.replay(result.artifact)).value);
      assert.equal(replay.visited.length, 3);
      assert.deepEqual(replay.data, ['Shared']);
      assert.equal(test.gets.slice(before).filter((url) => url.endsWith('/same')).length, 1);
    } finally {
      test.close();
    }
  },
);

await check(
  'JSON scalar identity, added records, empty results and namespace spelling are runtime data',
  async () => {
    for (const value of [null, false, 0, '', 'null']) {
      let current: JsonValue = value;
      const test = await fixture({
        pages: () => ({ text: JSON.stringify(current), media: 'application/json' }),
        replies: {
          'task.declare': [plainTask],
          'author.output': [{ $ref: '$.input.document' }],
          'result.review': [verdict],
        },
      });
      try {
        const result = published(await test.run({ outputSchema: {} }));
        assert.deepEqual(valueOf((await test.replay(result.artifact)).value).data, value);
        current = { changed: ['value'] };
        assert.deepEqual(valueOf((await test.replay(result.artifact)).value).data, current);
      } finally {
        test.close();
      }
    }
    let xml = '<root xmlns="urn:records"><entry>One</entry></root>';
    const test = await fixture({
      pages: () => ({ text: xml, media: 'application/xml' }),
      replies: {
        'task.declare': [plainTask],
        'author.xml.selection': [
          proposal({
            selector: '/r:root/r:entry',
            namespaces: { r: 'urn:records' },
            fields: { label: 'string(.)' },
          }),
        ],
        'author.output': [
          {
            $map: {
              over: { $ref: '$.input.items' },
              as: 'record',
              body: { $get: { from: { $var: 'record' }, path: ['label'] } },
            },
          },
        ],
        'result.review': [verdict],
      },
    });
    try {
      const result = published(await test.run());
      xml =
        '<other:root xmlns:other="urn:records"><other:entry>Changed</other:entry><other:entry>Added</other:entry></other:root>';
      assert.deepEqual(valueOf((await test.replay(result.artifact)).value).data, [
        'Changed',
        'Added',
      ]);
      xml = '<root xmlns="urn:records"/>';
      assert.deepEqual(valueOf((await test.replay(result.artifact)).value).data, []);
    } finally {
      test.close();
    }
  },
);

await check(
  'JSON and XML references reuse linked HTML/PDF acquisition without execution AI',
  async () => {
    for (const format of ['json', 'xml'] as const) {
      let names = ['a'];
      let prefix = 'c';
      const referenceProgram = {
        links: {
          $map: {
            over: { $ref: format === 'json' ? '$.input.document.entries' : '$.input.items' },
            as: 'record',
            body: { $get: { from: { $var: 'record' }, path: ['target'] } },
          },
        },
        resources: [],
      };
      const replies: Record<string, JsonValue[]> = {
        'task.declare': [{ requiresNavigation: true, resultFlow: resourceFlow }],
        'author.reference': [{ $const: null }, referenceProgram],
        'author.html': [
          proposal({
            ...select('main a.pdf'),
            result: { reference: ['attributes', 'href'] },
          }),
        ],
        'author.output': [htmlProgram],
        'result.review': [verdict],
      };
      if (format === 'xml') {
        const xml = {
          selector: '/c:catalog/c:entry',
          namespaces: { c: 'urn:catalog' },
          fields: { target: 'string(c:uri)' },
        };
        replies['author.xml.selection'] = [proposal(xml), proposal(xml)];
      }
      const root = origin + '/catalog.' + format;
      const referenceInputs: JsonValue[] = [];
      const test = await fixture({
        pages: (url) => {
          if (url === root)
            return {
              media: 'application/' + format,
              text:
                format === 'json'
                  ? JSON.stringify({ entries: names.map((n) => ({ target: '/page/' + n })) })
                  : `<${prefix}:catalog xmlns:${prefix}="urn:catalog">${names.map((n) => `<${prefix}:entry><${prefix}:uri>/page/${n}</${prefix}:uri></${prefix}:entry>`).join('')}</${prefix}:catalog>`,
            };
          const path = new URL(url).pathname;
          if (path.startsWith('/page/'))
            return {
              text: `<main><a class="pdf" href="/files/${path.split('/').pop()}.pdf">PDF</a></main>`,
            };
          assert(path.startsWith('/files/'));
          return { text: '%PDF-1.7\n' + path, media: 'application/pdf' };
        },
        replies,
        onModel(request) {
          if (format === 'xml' && request.name === 'author.xml.selection') {
            assert(
              request.input.messages.some(
                (m) =>
                  m.content.startsWith('UNTRUSTED xml SOURCE') && m.content.includes('<c:catalog'),
              ),
            );
            const feedback = request.input.messages.find((m) =>
              m.content.startsWith('CURRENT FEEDBACK'),
            );
            assert(feedback);
            if (JSON.stringify(feedback).includes('INVALID_VALUE')) {
              const parsed = z
                .object({
                  failure: z.object({
                    selectedValues: z.array(
                      z.object({ items: z.array(z.object({ target: z.string() })) }),
                    ),
                  }),
                })
                .parse(JSON.parse(feedback.content.slice(feedback.content.indexOf('\n') + 1)));
              assert.deepEqual(parsed.failure.selectedValues[0]?.items, [{ target: '/page/a' }]);
            }
            return;
          }
          if (request.name !== 'author.reference') return;
          const native = request.input.messages.find((message) =>
            message.content.startsWith('EXAMPLE PROGRAM CONTEXTS'),
          );
          assert(native);
          const value = z
            .json()
            .parse(JSON.parse(native.content.slice(native.content.indexOf('\n') + 1)));
          referenceInputs.push(value);
          assert(!JSON.stringify(request.input.messages).includes('base64'));
          assert(
            !request.input.messages.some((message) =>
              message.content.startsWith('UNTRUSTED xml SOURCE'),
            ),
          );
          assert(!JSON.stringify(request.input.messages).includes('<c:catalog'));
          if (referenceInputs.length === 2) {
            assert.deepEqual(
              referenceInputs[1],
              referenceInputs[0],
              'Reference trial failure must not replace selected native records with stage output',
            );
            assert(JSON.stringify(request.input.messages).includes('INVALID_VALUE'));
          }
        },
      });
      try {
        const result = published(
          await test.run({
            url: root,
            allowLinkFollowing: true,
            linkDepth: 1,
            maxPages: 5,
            allowResourceFetching: true,
            maxResources: 5,
          }),
        );
        assert.equal(referenceInputs.length, 2);
        if (format === 'xml') {
          assert.equal(test.models.filter((m) => m.name === 'author.xml.selection').length, 2);
        }
        for (const changed of [['changed'], ['changed', 'added'], []]) {
          names = changed;
          prefix = 'new';
          const outcome = await test.replay(result.artifact, root);
          assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
          const value = z
            .object({
              resources: z.object({ items: z.array(z.object({ source: HttpSourceSchema })) }),
              visited: z.array(z.string()),
            })
            .loose()
            .parse(outcome.value);
          assert.deepEqual(value.visited, [root, ...names.map((n) => origin + '/page/' + n)]);
          assert.deepEqual(
            value.resources.items.map((item) => item.source.url),
            names.map((n) => origin + '/files/' + n + '.pdf'),
          );
          for (const item of value.resources.items)
            assert(Buffer.from(item.source.body.base64, 'base64').toString().startsWith('%PDF-'));
        }
      } finally {
        test.close();
      }
    }
  },
);

await check('unsupported source formats and mixed frontiers cannot reach publication', async () => {
  for (const [task, request] of [
    [plainTask, {}],
    [
      { requiresNavigation: true, resultFlow: null },
      { allowLinkFollowing: true, linkDepth: 1 },
    ],
    [
      { requiresNavigation: false, resultFlow: resourceFlow },
      { allowResourceFetching: true, maxResources: 1 },
    ],
  ] as const) {
    const unsupported = await fixture({
      pages: () => ({ text: 'plain text', media: 'text/plain' }),
      replies: { 'task.declare': [task] },
    });
    try {
      const result = unresolved(await unsupported.run(request));
      assert.equal(result.reason, 'Empty, unsupported or mixed source frontier.');
      assert.deepEqual(unsupported.gets, [start]);
      assert.equal(unsupported.models.length, 1);
    } finally {
      unsupported.close();
    }
  }
  const replies = htmlReplies();
  replies['task.declare'] = [{ requiresNavigation: true, resultFlow: null }];
  replies['author.html'] = [proposal(select(null, 'main a'))];
  const mixed = await fixture({
    pages: (url) =>
      url === start
        ? { text: '<main><a href="/one">One</a><a href="/two">Two</a></main>' }
        : url.endsWith('/one')
          ? { text: '<main><p>HTML</p></main>' }
          : { text: '{}', media: 'application/json' },
    replies,
  });
  try {
    unresolved(await mixed.run({ allowLinkFollowing: true, linkDepth: 1, maxPages: 3 }));
    assert.equal(
      mixed.models.some((model) => model.name === 'result.review'),
      false,
    );
  } finally {
    mixed.close();
  }
});

await check(
  'request/profile ownership and cancellation prevent mutable or late publication',
  async () => {
    const controller = new AbortController();
    const cancelled = await fixture({
      pages: () => ({ text: '<main><p>Value</p></main>' }),
      replies: htmlReplies(),
      onModel: () => controller.abort(new Error('stop-after-task')),
    });
    try {
      await assert.rejects(cancelled.run({}, controller.signal), { code: 'CANCELLED' });
      assert.deepEqual(cancelled.gets, []);
    } finally {
      cancelled.close();
    }
    const mutableProfile = structuredClone(discoveryProfile);
    const test = await fixture({
      pages: () => ({ text: '<main><p>Value</p></main>' }),
      replies: htmlReplies(),
      profile: mutableProfile,
    });
    mutableProfile.settings.model = 'changed-after-factory';
    mutableProfile.author.maxModelSteps = 0;
    try {
      const request = {
        instruction: 'Original requested labels.',
        outputSchema: { type: 'array', items: { type: 'string' } },
        asOf: '2026-11-01T12:00:00+01:00',
      };
      const pending = test.run(request);
      request.instruction = 'Changed';
      request.outputSchema.items.type = 'integer';
      const result = published(await pending);
      assert(!JSON.stringify(result.artifact).includes('2026-11-01T12:00:00'));
      for (const model of test.models) {
        assert.equal(model.input.settings.model, discoveryProfile.settings.model);
        assert(
          model.input.messages.some(
            (message) => message.content === 'AS OF\n2026-11-01T12:00:00+01:00',
          ),
        );
        assert(JSON.stringify(model.input.messages).includes('Original requested labels.'));
      }
      assert.deepEqual(valueOf((await test.replay(result.artifact)).value).data, ['Value']);
    } finally {
      test.close();
    }
  },
);

await check(
  'a one-page caller ceiling publishes bounded current-page results without child acquisition',
  async () => {
    const replies = htmlReplies();
    replies['task.declare'] = [{ requiresNavigation: true, resultFlow: null }];
    replies['author.html'] = [proposal(select('main p', 'main a'))];
    const test = await fixture({
      pages: (url) => {
        assert.equal(url, start, 'One-page budget must prevent all child HTTP');
        return { text: '<main><p>Current</p><a href="/child">Child</a></main>' };
      },
      replies,
      onModel: assertReviewScope(1, true),
    });
    try {
      const result = published(
        await test.run({ allowLinkFollowing: true, linkDepth: 1, maxPages: 1 }),
      );
      assert.equal(z.object({ limited: z.boolean() }).parse(result).limited, true);
      assert.deepEqual(valueOf((await test.replay(result.artifact)).value), {
        data: ['Current'],
        visited: [start],
        limited: true,
        redirects: [],
      });
      assert(test.gets.every((url) => url === start));
    } finally {
      test.close();
    }
  },
);

await check(
  'automatic schema generation follows the successful source trial without an extra author controller',
  async () => {
    const replies = htmlReplies();
    replies['author.html'] = [proposal(select('main p'))];
    replies['result.contract'] = [
      {
        type: 'array',
        description: 'Requested labels.',
        items: { type: 'string', description: 'Label.' },
      },
    ];
    let structuralCalls = 0;
    const test = await fixture({
      pages: () => ({ text: '<main><p>Value</p></main>' }),
      replies,
      onModel: (request) => {
        if (request.name === 'author.html') structuralCalls++;
        if (request.name === 'result.contract')
          assert.equal(
            structuralCalls,
            1,
            'Automatic schema cannot be authored before the source proposal is tried and committed',
          );
      },
    });
    try {
      const result = published(await test.run({ outputSchema: undefined }));
      assert.deepEqual(valueOf((await test.replay(result.artifact)).value).data, ['Value']);
    } finally {
      test.close();
    }
  },
);

await check(
  'terminal JSON/XML data inside reference traversal refuses explicitly without publication',
  async () => {
    for (const format of ['json', 'xml'] as const) {
      const references: JsonValue = {
        links: {
          $map: {
            over: { $ref: format === 'json' ? '$.input.document.targets' : '$.input.items' },
            as: 'entry',
            body:
              format === 'json'
                ? { $var: 'entry' }
                : { $get: { from: { $var: 'entry' }, path: ['target'] } },
          },
        },
        resources: [],
      };
      const replies: Record<string, JsonValue[]> = {
        'task.declare': [{ requiresNavigation: true, resultFlow: null }],
        'author.reference': [references],
      };
      if (format === 'xml') {
        replies['author.xml.selection'] = [
          proposal({ selector: '/root/link', namespaces: {}, fields: { target: 'string(.)' } }),
        ];
      }
      const test = await fixture({
        pages: (url) => ({
          media: 'application/' + format,
          text:
            url === start
              ? format === 'json'
                ? JSON.stringify({ targets: ['/terminal'] })
                : '<root><link>/terminal</link></root>'
              : format === 'json'
                ? '{"value":"Terminal"}'
                : '<root><value>Terminal</value></root>',
        }),
        replies,
      });
      try {
        const outcome = await test.run({ allowLinkFollowing: true, linkDepth: 1, maxPages: 2 });
        const result = unresolved(outcome);
        assert.match(result.reason, /Terminal JSON\/XML data results.*unsupported/);
        assert.deepEqual(test.gets, [start, origin + '/terminal']);

        assert.equal(
          test.models.some(
            (model) => model.name === 'author.output' || model.name === 'result.review',
          ),
          false,
        );
      } finally {
        test.close();
      }
    }
  },
);

await check('exhausted reference author retains the last failed program and trial', async () => {
  const program = { links: { $ref: '$.input.missing' }, resources: [] };
  const test = await fixture({
    pages: () => ({ media: 'application/json', text: '{"links":["/next"]}' }),
    profile: { author: { ...discoveryProfile.author, maxModelSteps: 2 } },
    replies: {
      'task.declare': [{ requiresNavigation: true, resultFlow: null }],
      'author.reference': [program],
    },
  });
  try {
    const result = await test.run({ allowLinkFollowing: true, linkDepth: 1 });
    assert.equal(result.status, 'completed');
    assert.equal(unresolved(result).status, 'unresolved');
    const failedTrial = test.events.find((event) => {
      const parsed = z
        .object({
          kind: z.literal('artifact-trial'),
          outcome: z.object({
            status: z.literal('rejected'),
            error: z.object({ code: z.literal('E_MISSING_PATH') }),
          }),
        })
        .safeParse(event);
      return parsed.success;
    });
    assert(failedTrial, 'The failed trial remains available through the existing recording hook');
    assert(JSON.stringify(failedTrial).includes('$.input.missing'));
    assert.equal(test.gets.length, 1);
  } finally {
    test.close();
  }
});

await check(
  'a new frontier clears completed source feedback without retaining inspection history',
  async () => {
    let frontiers = 0;
    const test = await fixture({
      pages: (url) => ({
        text:
          new URL(url).pathname === '/root'
            ? '<main><a href="/child">Child</a></main>'
            : '<main><article>Fresh label</article></main>',
      }),
      replies: {
        'task.declare': [{ requiresNavigation: true, resultFlow: null }],
        'author.html': [
          proposal({
            ...select(null, 'main a'),
            selector: '[',
          }),
          {
            action: 'inspect',
            source: 0,
            query: { selector: 'main' },
            window: { offset: 0, limit: 1 },
          },
          proposal(select(null, 'main a')),
          proposal(select('article')),
        ],
        'author.output': [htmlProgram],
        'result.review': [
          { accepted: true, reason: 'Controlled offline source-context acceptance.' },
        ],
      },
      onModel(request) {
        if (request.name !== 'author.html') return;
        const message = request.input.messages.find((m) =>
          m.content.startsWith('CURRENT FEEDBACK'),
        );
        assert(message);
        const feedback = JSON.parse(message.content.slice(message.content.indexOf('\n') + 1));
        if (feedback.failure !== null || feedback.inspection !== null) return;
        assert.deepEqual(feedback, {
          failure: null,
          inspection: null,
        });
        frontiers++;
      },
    });
    try {
      published(await test.run({ allowLinkFollowing: true, linkDepth: 1, maxPages: 2 }));
      assert.equal(frontiers, 2);
    } finally {
      test.close();
    }
  },
);

await check(
  'download URL projection is shared by authoring, review, captured/fresh trials and AI-free changed resources',
  async () => {
    let names = ['first'];
    const finalUrl = (name: string) => 'https://files.invalid/' + name;
    const nativeInputs: JsonValue[] = [];
    const test = await fixture({
      pages: (url) => {
        if (url === start)
          return {
            text: `<main>${names.map((name) => `<a href="/download/${name}">File</a><a href="${finalUrl(name)}">Alias</a>`).join('')}</main>`,
          };
        if (url.startsWith(origin + '/download/'))
          return { text: '', status: 307, location: finalUrl(url.split('/').at(-1) ?? '') };
        assert(url.startsWith('https://files.invalid/'));
        return { text: 'Opaque resource bytes', media: 'application/octet-stream' };
      },
      replies: {
        'task.declare': [{ requiresNavigation: false, resultFlow: resourceFlow }],
        'author.html': [
          proposal({
            ...select('main a'),
            result: { reference: ['attributes', 'href'] },
          }),
        ],
        'author.output': [{ $ref: '$.input.resourceUrls' }],
        'result.review': [verdict],
      },
      onModel(request) {
        assert(!JSON.stringify(request.input.messages).includes('base64'));
        if (request.name === 'author.output') {
          const examples = request.input.messages.find((m) =>
            m.content.startsWith('EXAMPLE PROGRAM CONTEXTS'),
          );
          assert(examples);
          const scopes = z
            .array(z.object({ input: z.object({ resourceUrls: z.array(z.url()) }) }))
            .parse(JSON.parse(examples.content.slice(examples.content.indexOf('\n') + 1)));
          assert.deepEqual(scopes[0]?.input.resourceUrls, [finalUrl('first')]);
          nativeInputs.push(...scopes.map((scope) => scope.input));
        }
        if (request.name === 'result.review') {
          const message = request.input.messages.find((m) => m.content.startsWith('LIMIT CONTEXT'));
          assert(message);
          const context = z
            .object({
              resourceUrls: z.array(z.url()),
              resourceRedirects: z.array(
                z
                  .object({ url: z.url(), status: z.number(), location: z.array(z.string()) })
                  .strict(),
              ),
            })
            .parse(JSON.parse(message.content.slice(message.content.indexOf('\n') + 1)));
          assert.deepEqual(context.resourceUrls, [finalUrl('first')]);
          assert.deepEqual(context.resourceRedirects, [
            { url: origin + '/download/first', status: 307, location: [finalUrl('first')] },
          ]);
          assert(!JSON.stringify(context).includes('Opaque resource bytes'));
        }
      },
    });
    try {
      const result = published(
        await test.run({
          instruction: 'Download the linked files and return their final URLs.',
          allowResourceFetching: true,
          maxResources: 4,
          outputSchema: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
            uniqueItems: true,
          },
        }),
      );
      assert.equal(nativeInputs.length, 1);
      assert.equal(
        test.gets.filter((url) => url === finalUrl('first')).length,
        2,
        'Captured acquisition and fresh verification each fetch the final resource once',
      );
      const beforeReplayModels = test.models.length;
      for (const changed of [['changed'], ['changed', 'added'], []]) {
        names = changed;
        const before = test.gets.length;
        const outcome = await test.replay(result.artifact);
        assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
        const value = z
          .object({
            data: z.array(z.url()),
            resources: z.object({ items: z.array(z.object({ source: HttpSourceSchema })) }),
          })
          .parse(outcome.value);
        assert.deepEqual(value.data, changed.map(finalUrl));
        assert.deepEqual(
          value.resources.items.map((item) => item.source.url),
          value.data,
        );
        for (const name of changed)
          assert.equal(test.gets.slice(before).filter((url) => url === finalUrl(name)).length, 1);
      }
      assert.equal(test.models.length, beforeReplayModels, 'Changed/added/empty replay uses no AI');
    } finally {
      test.close();
    }
  },
);

await check(
  'paired XML can repair extraction and mapping together with original-source inspection',
  async () => {
    const xml =
      '<root><entry><document>/destination</document><file>/download</file></entry></root>';
    const wrong = { selector: '/root/entry', namespaces: {}, fields: { resource: 'string(file)' } };
    const correct = {
      selector: '/root/entry',
      namespaces: {},
      fields: { destination: 'string(document)' },
    };
    const mapping = {
      links: { $pluck: { over: { $ref: '$.input.items' }, key: 'destination' } },
      resources: [],
    };
    const badMapping = { links: [{ $ref: '$.input.items[0].missingDocument' }], resources: [] };
    let attempts = 0;
    const test = await fixture({
      pages: (url) =>
        url === start
          ? { text: xml, media: 'application/xml' }
          : { text: '<main><p>Destination record</p></main>' },
      replies: {
        'task.declare': [{ requiresNavigation: true, resultFlow: null }],
        'author.xml.selection': [
          proposal(wrong),
          {
            action: 'inspect',
            source: 0,
            query: {
              selector: '/root/entry',
              namespaces: {},
              fields: { observed: 'string(document)' },
            },
            window: { offset: 0, limit: 1 },
          },
          proposal(correct),
        ],
        'author.reference': [badMapping, mapping],
        'author.html': [proposal(select('main p'))],
        'author.output': [htmlProgram],
        'result.review': [verdict],
      },
      onModel(request) {
        if (request.name !== 'author.xml.selection') return;
        attempts++;
        assert.deepEqual(
          test.gets,
          [start],
          'Failed pairs/inspections cannot start onward acquisition',
        );
        assert(
          request.input.messages.some(
            (m) => m.content.startsWith('UNTRUSTED xml SOURCE') && m.content.includes(xml),
          ),
        );
        const feedbackMessage = request.input.messages.find((m) =>
          m.content.startsWith('CURRENT FEEDBACK'),
        );
        assert(feedbackMessage);
        const feedback = JSON.parse(
          feedbackMessage.content.slice(feedbackMessage.content.indexOf('\n') + 1),
        );
        if (attempts > 1) {
          const failed = z
            .object({
              failure: z.object({
                rule: z.json(),
                trials: z.array(
                  z.object({
                    status: z.literal('rejected'),
                    error: z.object({ code: z.string() }),
                  }),
                ),
                selectedValues: z.array(
                  z.object({ items: z.array(z.object({ resource: z.string() })) }),
                ),
              }),
            })
            .parse(feedback);
          assert.deepEqual(failed.failure.rule, wrong);
          assert.equal(failed.failure.trials[0]?.error.code, 'E_MISSING_PATH');
          assert.deepEqual(failed.failure.selectedValues[0]?.items, [{ resource: '/download' }]);
          assert(
            !JSON.stringify(feedback).includes('AUTHORING_MINIMUM_MATCHES'),
            'A mapping failure must not masquerade as too few source matches',
          );
        }
        if (attempts === 3) {
          const inspected = z
            .object({
              inspection: z.object({
                result: z.object({
                  value: z.object({ items: z.array(z.object({ observed: z.string() })) }),
                }),
              }),
            })
            .parse(feedback);
          assert.deepEqual(inspected.inspection.result.value.items, [{ observed: '/destination' }]);
        }
      },
    });
    try {
      const result = published(
        await test.run({ allowLinkFollowing: true, linkDepth: 1, maxPages: 2 }),
      );
      assert.equal(attempts, 3);
      assert.equal(test.gets.includes(origin + '/download'), false);
      assert.deepEqual(valueOf((await test.replay(result.artifact)).value).data, [
        'Destination record',
      ]);
    } finally {
      test.close();
    }
  },
);

await check(
  'paired XML failures exhaust the existing shared allowance without acquiring children',
  async () => {
    const pair = {
      xml: { selector: '/root/entry', namespaces: {}, fields: { value: 'string(.)' } },
      mapping: { links: [{ $ref: '$.input.items[0].missing' }], resources: [] },
    };
    const test = await fixture({
      pages: () => ({ text: '<root><entry>Value</entry></root>', media: 'application/xml' }),
      profile: { author: { ...discoveryProfile.author, maxModelSteps: 3 } },
      replies: {
        'task.declare': [{ requiresNavigation: true, resultFlow: null }],
        'author.xml.selection': [proposal(pair.xml)],
        'author.reference': [pair.mapping],
      },
    });
    try {
      const result = unresolved(await test.run({ allowLinkFollowing: true, linkDepth: 1 }));
      assert.match(result.reason, /allowance exhausted/);
      assert.deepEqual(test.gets, [start]);
      assert.equal(test.models.length, 3);
      const diagnostic = test.events.find((event) =>
        JSON.stringify(event).includes('$.input.items[0].missing'),
      );
      assert(diagnostic, 'Rejected XML mapping remains in recorded trial evidence');
      assert(JSON.stringify(diagnostic).includes('/root/entry'));
    } finally {
      test.close();
    }
  },
);

console.log(
  `Grounded acquisition: ${groups} generic integration groups passed; local captures and controlled model responses only.`,
);
