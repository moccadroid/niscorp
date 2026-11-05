import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { z } from 'zod';
import { providerRegistry } from '@niscorp/signal';
import { prepareArtifact } from '../src/index.js';
import {
  createDiscoveryOperations,
  discoveryWorkflow,
  discoveryProfile,
} from '../src/discovery/index.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
import { createHtmlStructure, readHtmlProfile } from '../src/readers/html/index.js';

const fields = {
  text: { selector: ':scope > h2', attribute: null, minimum: 1, maximum: 1 },
  targets: { selector: 'a', attribute: 'href', minimum: 0, maximum: null },
  own: { selector: ':scope', attribute: 'data-id', minimum: 1, maximum: 1 },
};
const html =
  '<nav><h2>Outside</h2><a href="/menu">Menu</a></nav><article class="row" data-id="a"><h2> Alpha <em>one</em></h2><aside><h2>Noise</h2></aside><a href="/a">A</a><a>Missing</a><script>hidden</script></article><article class="row" data-id="b"><h2>Beta</h2><a href="/b">B</a></article>';
const source = (text: string) => {
  const body = captureBody(Buffer.from(text));
  return {
    url: 'https://fixture.invalid/records',
    status: 200,
    headers: { 'content-type': ['text/html'] },
    encoded: body,
    body,
  };
};
const web = createWebOperations();
const select = web.operations['html.select'];
assert(select);
const context = { signal: new AbortController().signal };
const result = z.object({
  items: z.array(
    z.object({
      text: z.string(),
      path: z.array(z.number()),
      fields: z.record(z.string(), z.array(z.string().nullable())),
    }),
  ),
});
let groups = 0;
try {
  const input = source(html),
    before = structuredClone(input);
  const selected = result.parse(
    await select.run({ source: input, selector: 'article.row', fields }, context),
  );
  assert.deepEqual(
    selected.items.map((i) => i.fields),
    [
      { text: [' Alpha one'], targets: ['/a', null], own: ['a'] },
      { text: ['Beta'], targets: ['/b'], own: ['b'] },
    ],
  );
  assert.deepEqual(input, before);
  assert.equal(selected.items[0]?.text.includes('hidden'), false);
  groups++;
  const structure = createHtmlStructure(html),
    record = structure.query('article.row')[0];
  assert(record);
  for (const selector of [
    ':scope + article',
    'body h2',
    ':scope:has(+ article)',
    ':scope:has(~ article)',
    ':scope + article h2',
  ])
    assert.equal(structure.queryWithin(selector, record).length, 0, selector);
  assert.deepEqual(
    structure.queryWithin('h2', record).map((n) => structure.textOf(n)),
    [' Alpha one', 'Noise'],
  );
  assert.equal(structure.queryWithin(':scope', record)[0], record);
  assert(!structure.queryWithin(':scope *', record).includes(record));
  assert.equal(structure.queryWithin(':scope article', record).length, 0);
  assert.equal(record.parent?.type, 'tag');
  groups++;
  const byteLimited = createWebOperations({
    html: { ...readHtmlProfile(), limits: { ...readHtmlProfile().limits, maxFieldBytes: 150 } },
  });
  const byteSelect = byteLimited.operations['html.select'];
  assert(byteSelect);
  try {
    await assert.rejects(
      byteSelect.run(
        {
          source: source('<p>' + 'é'.repeat(50) + '</p>'),
          selector: 'p',
          fields: {
            one: { selector: ':scope', attribute: null, minimum: 1, maximum: 1 },
            two: { selector: ':scope', attribute: null, minimum: 1, maximum: 1 },
          },
        },
        context,
      ),
      /field-byte allowance/,
    );
  } finally {
    byteLimited.close();
  }
  groups++;
  const optional = {
    ...fields,
    absent: { selector: '.missing', attribute: null, minimum: 0, maximum: 1 },
  };
  assert.deepEqual(
    result.parse(await select.run({ source: input, selector: '.row', fields: optional }, context))
      .items[0]?.fields.absent,
    [],
  );
  groups++;
  for (const rule of [
    { ...fields, text: { ...fields.text, selector: 'h2' } },
    { ...fields, text: { ...fields.text, selector: '.missing' } },
    { ...fields, text: { ...fields.text, minimum: 2, maximum: 1 } },
  ])
    await assert.rejects(
      select.run({ source: input, selector: '.row', fields: rule }, context),
      /HTML_FIELD_MATCHES/,
    );
  await assert.rejects(
    select.run(
      {
        source: input,
        selector: '.missing',
        fields: { invalid: { selector: 'p:hover', attribute: null, minimum: 0, maximum: null } },
      },
      context,
    ),
    /HTML_SELECTOR/,
  );
  groups++;
  const plain = await select.run({ source: input, selector: '.row' }, context);
  assert.deepEqual(
    await select.run({ source: input, selector: '.row', fields: null }, context),
    plain,
  );
  assert.deepEqual(
    result.parse(await select.run({ source: input, selector: '.missing', fields }, context)).items,
    [],
  );
  groups++;
  const limited = createWebOperations({
    html: {
      ...readHtmlProfile(),
      limits: {
        ...readHtmlProfile().limits,
        maxFieldValues: 2,
      },
    },
  });
  const limitedSelect = limited.operations['html.select'];
  assert(limitedSelect);
  try {
    await assert.rejects(
      limitedSelect.run({ source: input, selector: '.row', fields }, context),
      /field-value allowance/,
    );
  } finally {
    limited.close();
  }
  groups++;
  const special = JSON.parse(
    '{"__proto__":{"selector":":scope","attribute":null,"minimum":0,"maximum":null}}',
  );
  await assert.rejects(
    select.run({ source: input, selector: '.row', fields: special }, context),
    /__proto__/,
  );
  const ordinary = {
    constructor: { selector: ':scope', attribute: 'data-id', minimum: 1, maximum: 1 },
    $value: { selector: 'a', attribute: 'href', minimum: 0, maximum: null },
  };
  assert.deepEqual(
    result.parse(await select.run({ source: input, selector: '.row', fields: ordinary }, context))
      .items[0]?.fields.constructor,
    ['a'],
  );
  groups++;
  const controller = new AbortController();
  const retained = createHtmlStructure(html, {}, controller.signal);
  const item = retained.query('.row')[0];
  assert(item);
  controller.abort();
  assert.throws(() => retained.queryWithin('h2', item));
  groups++;
} finally {
  web.close();
}

let page = html,
  models = 0,
  authors = 0,
  repair = false;
const feedback: string[] = [];
const chosenFields = { label: fields.text, references: fields.targets };
const mapping = {
  $map: {
    over: { $ref: '$.input.records' },
    as: 'record',
    body: {
      caption: { $get: { from: { $var: 'record' }, path: ['fields', 'label', 0] } },
      anchors: { $get: { from: { $var: 'record' }, path: ['fields', 'references'] } },
    },
  },
};
const server = createServer(async (request, response) => {
  if (request.method === 'GET') {
    response.setHeader('content-type', 'text/html');
    response.end(page);
    return;
  }
  let body = '';
  for await (const part of request) body += part;
  const input = z
    .object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) })
    .parse(JSON.parse(body));
  models++;
  feedback.push(JSON.stringify(input.messages));
  const messages = input.messages;
  let data: unknown;
  if (messages.some((m) => m.content.startsWith('OFFERED RESULT FLOWS\n')))
    data = { requiresNavigation: false, resultFlow: null };
  else if (messages.some((m) => m.content.startsWith('DATA TO REVIEW\n'))) {
    const final = messages.find((m) => m.content.startsWith('DATA TO REVIEW\n'));
    assert(final);
    const output: unknown = JSON.parse(final.content.slice('DATA TO REVIEW\n'.length));
    assert(Array.isArray(output));
    assert(output.length > 0);
    for (const row of output) assert.deepEqual(Object.keys(row).sort(), ['anchors', 'caption']);
    assert(messages.some((m) => m.content.startsWith('UNTRUSTED SOURCE EVIDENCE\nFORMAT: html\n')));
    const verdict = input.messages.find(
      (m) => m.role === 'system' && m.content.startsWith('OUTPUT SCHEMA —'),
    );
    assert(verdict);
    const offered = JSON.parse(verdict.content.slice(verdict.content.indexOf('\n') + 1));
    assert(JSON.stringify(offered).includes('"accepted"'));
    assert(JSON.stringify(offered).includes('"inspect"'));
    data = { accepted: true, reason: 'Record fields retain their own headings and links.' };
  } else if (messages.some((message) => message.content.startsWith('EXAMPLE PROGRAM CONTEXTS'))) {
    const native = messages.find((message) =>
      message.content.startsWith('EXAMPLE PROGRAM CONTEXTS'),
    );
    assert(native);
    const contexts = z
      .array(z.object({ input: z.json() }).strict())
      .parse(JSON.parse(native.content.slice(native.content.indexOf('\n') + 1)));
    const selected = z
      .object({
        records: z.array(z.object({ fields: z.record(z.string(), z.json()) })),
      })
      .parse(contexts[0]?.input);
    assert.deepEqual(Object.keys(selected.records[0]?.fields ?? {}).sort(), [
      'label',
      'references',
    ]);
    assert(!messages.some((message) => message.content.startsWith('UNTRUSTED html SOURCE')));
    assert(!messages.some((message) => message.content.startsWith('CURRENT SOURCE RULE')));
    data = mapping;
  } else {
    const prefix = 'SOURCE AUTHORING CONTEXT\n';
    const context = messages.find((message) => message.content.startsWith(prefix));
    assert(context);
    assert(messages.some((message) => message.content.startsWith('UNTRUSTED html SOURCE\n')));
    authors++;
    const selectedFields =
      repair && authors === 1
        ? { ...chosenFields, label: { ...fields.text, selector: '[' } }
        : chosenFields;
    const selection = {
      selector: 'article.row',
      fields: Object.fromEntries(
        Object.entries(selectedFields).map(([name, field]) => {
          const { minimum: _minimum, maximum: _maximum, ...read } = field;
          return [name, read];
        }),
      ),
    };
    data = { action: 'propose', candidate: { links: null, result: null, ...selection } };
  }
  response.setHeader('content-type', 'text/event-stream');
  response.end(
    'data: ' +
      JSON.stringify({
        id: 'html-record-protocol',
        choices: [
          { index: 0, delta: { content: JSON.stringify({ data }) }, finish_reason: 'stop' },
        ],
      }) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const url = 'http://127.0.0.1:' + address.port + '/records';
const runtime = createWebOperations();
const discover = async () => {
  const discovery = createDiscoveryOperations({
    author: { apiKey: 'offline' },
    profile: {
      ...discoveryProfile,
      provider: {
        adapter: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:' + address.port + '/v1',
        wire:
          providerRegistry.groq?.adapter === 'openai-compatible' ? providerRegistry.groq.wire : [],
      },
    },
  });
  try {
    return await (
      await prepareArtifact(discoveryWorkflow, discovery.operations, discovery.limits)
    ).run({
      url,
      instruction:
        'Return each entry’s heading and all link href values, keeping each entry together.',
      outputSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            caption: { type: 'string' },
            anchors: { type: 'array', items: { type: ['string', 'null'] } },
          },
          required: ['caption', 'anchors'],
          additionalProperties: false,
        },
      },
    });
  } finally {
    discovery.close();
  }
};
try {
  const outcome = await discover();
  assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
  const discovered = z.object({ artifact: z.unknown() }).parse(outcome.value);
  assert(discovered.artifact, JSON.stringify(outcome).slice(-2500));
  const prepared = await prepareArtifact(discovered.artifact, runtime.operations),
    before = models;
  for (const [content, expected] of [
    [
      '<article class="row"><h2>Changed</h2><a href="/new">New</a></article>',
      [{ caption: 'Changed', anchors: ['/new'] }],
    ],
    [
      '<article class="row"><h2>First</h2></article><article class="row"><h2>Added</h2><a href="/second">Second</a></article>',
      [
        { caption: 'First', anchors: [] },
        { caption: 'Added', anchors: ['/second'] },
      ],
    ],
    ['<main>No entries</main>', []],
  ] as const) {
    page = content;
    const replay = await prepared.run({ url });
    assert.equal(replay.status, 'completed', JSON.stringify(replay));
    assert.deepEqual(z.object({ data: z.unknown() }).parse(replay.value).data, expected);
    assert.equal(models, before);
    groups++;
  }
  page = '<article class="row"><h2>One</h2><h2>Two</h2></article>';
  const ambiguous = await prepared.run({ url });
  assert.equal(ambiguous.status, 'completed');
  assert.deepEqual(z.object({ data: z.json() }).parse(ambiguous.value).data, [
    { caption: 'One', anchors: [] },
  ]);
  assert.equal(models, before);
  groups++;
  page = html;
  authors = 0;
  repair = true;
  const recovered = await discover();
  assert(z.object({ artifact: z.unknown() }).parse(recovered.value).artifact);
  assert(feedback.some((v) => v.includes('HTML_SELECTOR')));
  groups++;
  console.log(
    'HTML records: ' +
      groups +
      ' offline groups passed; scoped dynamic fields, count bounds, missing/empty/duplicate values, profile limits, Cortex repair and AI-free changed/added/empty records.',
  );
} finally {
  runtime.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
