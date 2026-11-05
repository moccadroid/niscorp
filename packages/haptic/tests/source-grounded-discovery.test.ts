import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import type { JsonValue } from '../src/engine/contracts.js';
import { defineOperation } from '../src/engine/operation.js';
import { RunControl } from '../src/engine/control.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { createPrepareOperation, createTrialOperation } from '../src/discovery/trial.js';
import { readXmlProfile } from '../src/readers/xml/index.js';

const url = 'https://grounded.invalid/collection';
const html =
  '<nav>source-only-sentinel</nav><main><article><h2>One</h2></article><article><h2>Two</h2></article></main>';
const resultSchema = { type: 'array', items: { type: 'string' } };
const schemaBody = {
  type: 'array',
  description: 'Requested labels in document order.',
  items: { type: 'string', description: 'A selected record label.' },
};
const rule = {
  selector: 'main article',
  fields: { label: { selector: 'h2', attribute: null, minimum: 1, maximum: 1 } },
  preconditions: [{ selector: 'main', minimum: 1, maximum: 1 }],
  links: null,
  result: null,
};
const htmlMapping = {
  $map: {
    over: { $ref: '$.input.records' },
    as: 'record',
    body: { $get: { from: { $var: 'record' }, path: ['fields', 'label', 0] } },
  },
};
const propose = (candidate: JsonValue): JsonValue => ({ action: 'propose', candidate });
const source = (text: string, mediaType = 'text/html', status = 200) => {
  const body = captureBody(Buffer.from(text));
  return { url, status, headers: { 'content-type': [mediaType] }, body, encoded: body };
};
const modelInput = z
  .object({
    messages: z.array(z.object({ role: z.string(), content: z.string() }).strict()),
    settings: z.object({ maxSteps: z.number(), outputAttempts: z.number() }).loose(),
  })
  .loose();
type ModelInput = z.output<typeof modelInput>;
type Reply = JsonValue | ((input: ModelInput) => JsonValue);
const publicResult = z
  .object({
    status: z.enum(['ready', 'unresolved']),
    artifact: z.json().nullable(),
    outputSchema: z.json().nullable(),
    trial: z.json().nullable(),
    reason: z.string().nullable(),
    partialTrial: z.json().nullable(),
  })
  .loose();

const setup = async (options: {
  replies: Record<string, Reply[]>;
  source?: ReturnType<typeof source>;
  freshSource?: ReturnType<typeof source>;
  linkedSources?: Record<string, ReturnType<typeof source>>;
  profile?: Record<string, unknown>;
  modelErrors?: Record<string, { code: string; message: string }>;
  web?: Parameters<typeof createWebOperations>[0];
}) => {
  const web = createWebOperations(options.web);
  const discovery = createDiscoveryOperations({
    author: { apiKey: 'unused-offline' },
    profile: { ...discoveryProfile, ...options.profile },
    web: options.web,
  });
  const gets: string[] = [];
  const models: { name: string; input: ModelInput }[] = [];
  const replies = Object.fromEntries(
    Object.entries(options.replies).map(([name, values]) => [name, [...values]]),
  );
  let currentSource = options.source ?? source(html);
  const http = defineOperation({
    input: z.object({ url: z.string() }).strict(),
    output: HttpSourceSchema,
    run(input) {
      assert(input.url === url || options.linkedSources?.[input.url], 'Unexpected offline target');
      gets.push(input.url);
      const linked = options.linkedSources?.[input.url];
      if (linked) return linked;
      return gets.length > 1 && options.freshSource ? options.freshSource : currentSource;
    },
  });
  const mechanical = { ...web.operations, 'http.get': http };
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
      input: modelInput,
      output: z.json(),
      run(input) {
        models.push({ name, input: structuredClone(input) });
        const modelError = options.modelErrors?.[name];
        if (modelError)
          return {
            ok: false,
            decision: null,
            error: modelError,
            meta: {
              steps: 1,
              outputRetries: 0,
              elapsedMs: 1,
              strategy: 'emit',
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false },
            },
            rawSources: [],
          };
        const reply = replies[name]?.shift();
        assert.notEqual(
          reply,
          undefined,
          'Unexpected or excess model call: ' + name + JSON.stringify(input.messages.slice(-4)),
        );
        assert(reply !== undefined);
        const decision = typeof reply === 'function' ? reply(input) : reply;
        return {
          ok: true,
          decision,
          error: null,
          meta: {
            steps: 1,
            outputRetries: 0,
            elapsedMs: 1,
            strategy: 'emit',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false },
          },
          rawSources: [],
        };
      },
    });
  }
  const prepared = await prepareArtifact(
    discoveryWorkflow,
    {
      ...operations,
      'http.get': http,
      'artifact.prepare': createPrepareOperation(mechanical, discovery.limits),
      'artifact.trial': createTrialOperation(mechanical, discovery.limits),
    },
    discovery.limits,
  );
  const execute = (request: Record<string, unknown> = {}) =>
    prepared.run(
      Object.fromEntries(
        Object.entries({
          url,
          instruction: 'Return the labels of every record in document order.',
          outputSchema: resultSchema,
          ...request,
        }).filter(([, value]) => value !== undefined),
      ),
    );
  return {
    gets,
    models,
    raw: execute,
    async run(request: Record<string, unknown> = {}) {
      const outcome = await execute(request);
      assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
      return publicResult.parse(outcome.value);
    },
    async replay(artifact: JsonValue, text = html, mediaType = 'text/html') {
      const before = models.length;
      currentSource = source(text, mediaType);
      const result = await (
        await prepareArtifact(artifact, mechanical, discovery.limits)
      ).run({
        url,
      });
      assert.equal(result.status, 'completed', JSON.stringify(result));
      assert.equal(models.length, before, 'Finished execution must never call a model');
      return z.object({ data: z.json() }).parse(result.value).data;
    },
    close() {
      discovery.close();
      web.close();
    },
  };
};
const task = { requiresNavigation: false, resultFlow: null };
const verdict = {
  accepted: true,
  reason: 'Controlled protocol acceptance, not a model evaluation.',
};
const successReplies = (): Record<string, Reply[]> => ({
  'task.declare': [task],
  'author.html': [propose(rule)],
  'author.output': [htmlMapping],
  'result.review': [verdict],
});

{
  const test = await setup({ replies: successReplies() });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready', JSON.stringify(result));
    assert(result.artifact);
    assert.deepEqual(result.outputSchema, resultSchema);
    assert.equal(test.gets.length, 2, 'One acquisition and the complete fresh mechanical trial');
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
    assert.deepEqual(
      await test.replay(
        result.artifact,
        '<main><article><h2>Changed</h2></article><article><h2>Added</h2></article><article><h2>Third</h2></article></main>',
      ),
      ['Changed', 'Added', 'Third'],
    );
    const observed = test.models.find((entry) => entry.name === 'author.output');
    assert(observed);
    assert(JSON.stringify(observed.input.messages).includes('One'));
    assert(!JSON.stringify(observed.input.messages).includes('base64'));
    assert(!JSON.stringify(observed.input.messages).includes('source-only-sentinel'));
    assert(!JSON.stringify(observed.input.messages).includes('UNTRUSTED html SOURCE'));
    assert(
      observed.input.messages.some((message) =>
        message.content.startsWith('EXAMPLE PROGRAM CONTEXTS'),
      ),
    );
    assert(
      observed.input.messages.some((message) => message.content.startsWith('RESULT DATA CONTRACT')),
    );
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: fixed source-to-mapping handoff has actual selected values without source bodies or finish calls',
);

{
  const replies = successReplies();
  replies['author.html'] = [propose({ selector: null, links: 'a', result: null }), propose(rule)];
  const test = await setup({ replies });
  try {
    const result = await test.run({ allowLinkFollowing: false, linkDepth: 0, maxPages: 1 });
    assert.equal(result.status, 'ready', JSON.stringify(result));
    assert(result.artifact);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
    assert(test.gets.every((target) => target === url));
  } finally {
    test.close();
  }
}
console.log(
  '[pass] controlled source repair: a forbidden navigation-only rule can be replaced with working extraction while caller following remains disabled',
);

{
  const replies = successReplies();
  replies['result.contract'] = [schemaBody];
  const test = await setup({ replies });
  try {
    const result = await test.run({ outputSchema: undefined });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    const contract = test.models.find((entry) => entry.name === 'result.contract');
    assert(contract);
    assert(JSON.stringify(contract.input.messages).includes('One'));
    assert(JSON.stringify(contract.input.messages).includes('Two'));
    assert.deepEqual(result.outputSchema, {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      ...schemaBody,
    });
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: automatic contract follows source observations and caller schemas bypass generation',
);

{
  const replies = successReplies();
  replies['result.contract'] = [
    {
      type: 'object',
      description: 'An invalid required-property contract.',
      properties: {},
      required: ['missing'],
      additionalProperties: false,
    },
    schemaBody,
  ];
  const test = await setup({ replies });
  try {
    const result = await test.run({ outputSchema: undefined });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(test.models.filter((entry) => entry.name === 'result.contract').length, 2);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
    const second = test.models.filter((entry) => entry.name === 'result.contract')[1];
    assert(second && JSON.stringify(second.input.messages).includes('admission'));
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: compiler-invalid ordinary schemas receive JSON feedback within the same allowance',
);

{
  for (const operation of [
    'task.declare',
    'author.html',
    'author.output',
    'result.contract',
    'result.review',
  ]) {
    const replies = successReplies();
    replies['result.contract'] = [schemaBody];
    const test = await setup({
      replies,
      modelErrors: {
        [operation]: { code: 'CONTROLLED_PROVIDER_ERROR', message: 'Concrete recovery failure.' },
      },
    });
    try {
      const result = await test.run({
        outputSchema: operation === 'result.contract' ? undefined : resultSchema,
      });
      if (operation === 'result.review') {
        assert.equal(result.status, 'ready');
        assert(result.artifact);
        assert(JSON.stringify(result).includes('CONTROLLED_PROVIDER_ERROR'));
      } else {
        assert.equal(result.status, 'unresolved');
        assert.equal(result.artifact, null);
        assert(result.reason);
        assert(result.reason.includes('CONTROLLED_PROVIDER_ERROR'));
        assert(result.reason.includes('Concrete recovery failure.'));
      }
    } finally {
      test.close();
    }
  }
}
console.log(
  '[pass] grounded discovery: author failures expose their code/message; reviewer failure stays visible without suppressing a working artifact',
);

{
  const selected = { selector: '/root/record', namespaces: {}, fields: { label: 'string(.)' } };
  const test = await setup({
    source: source('<root><record>One</record><record>Two</record></root>', 'application/xml'),
    replies: {
      'task.declare': [task],
      'author.xml.selection': [
        propose({ ...selected, selector: '/root/absent' }),
        propose(selected),
      ],
      'author.output': [{ $pluck: { over: { $ref: '$.input.items' }, key: 'label' } }],
      'result.review': [verdict],
    },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    const attempts = test.models.filter((entry) => entry.name === 'author.xml.selection');
    assert.equal(attempts.length, 2);
    assert(JSON.stringify(attempts[1]?.input.messages).includes('AUTHORING_MINIMUM_MATCHES'));
    assert.deepEqual(await test.replay(result.artifact, '<root/>', 'application/xml'), []);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: XML discovery evidence minima are JSON-owned and never frozen as runtime nonempty requirements',
);

{
  const test = await setup({ replies: {} });
  try {
    await assert.rejects(test.run({ outputSchema: { type: 'not-a-json-schema-type' } }));
    assert.deepEqual(test.gets, []);
    assert.deepEqual(test.models, []);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: invalid caller contract fails before HTTP and model effects',
);

{
  const replies = successReplies();
  let feedbackSeen = false;
  replies['task.declare'] = [
    { requiresNavigation: true, resultFlow: null },
    (input) => {
      const feedback = input.messages.find((message) =>
        message.content.startsWith('CURRENT DECLARATION FEEDBACK'),
      );
      assert(feedback && !feedback.content.endsWith('\nnull'));
      assert.deepEqual(test.gets, [], 'No acquisition before an allowed task declaration');
      feedbackSeen = true;
      return task;
    },
  ];
  const test = await setup({ replies });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert(feedbackSeen);
    assert.equal(test.models.filter((model) => model.name === 'task.declare').length, 2);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: unavailable task action gets bounded admission feedback before any acquisition',
);

{
  const replies = successReplies();
  replies['author.output'] = [
    { $const: 123 },
    (input) => {
      assert(input.messages.some((message) => message.role === 'assistant'));
      assert(!JSON.stringify(input.messages).includes('source-only-sentinel'));
      assert(!JSON.stringify(input.messages).includes('UNTRUSTED html SOURCE'));
      const feedback = input.messages.find((message) =>
        message.content.startsWith('CURRENT MAPPING FEEDBACK'),
      );
      assert(feedback);
      assert(feedback.content.includes('INVALID_VALUE'));
      assert(feedback.content.includes('123'));
      return htmlMapping;
    },
  ];
  const test = await setup({ replies });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(test.models.filter((model) => model.name === 'author.html').length, 1);
    assert.equal(test.models.filter((model) => model.name === 'author.output').length, 2);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: a failed bare Prism program repairs with its own history and native data, without source-author conversations',
);

{
  const replies = successReplies();
  replies['result.review'] = [{ accepted: false, reason: 'Controlled source meaning rejection.' }];
  const test = await setup({
    replies,
    profile: { review: { ...discoveryProfile.review, maxRepairs: 0 } },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert(result.partialTrial);
    assert(JSON.stringify(result).includes('Controlled source meaning rejection.'));
    assert.equal(test.models.filter((model) => model.name === 'result.review').length, 1);
    assert.equal(test.models.filter((model) => model.name === 'author.html').length, 1);
    assert.equal(test.models.filter((model) => model.name === 'author.output').length, 1);
    assert.deepEqual(
      test.gets,
      [url, url],
      'With repair disabled, negative review still permits the fresh mechanical publication check',
    );
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: semantic rejection remains visible but does not suppress a working artifact',
);

const rejected = {
  accepted: false,
  reason: 'A requested record is missing from the final result.',
};
const firstOnly = { ...rule, selector: 'main article:first-child' };
const assertOwnHistory = (input: ModelInput, previous: JsonValue): void => {
  const past = input.messages.filter((message) => message.role === 'assistant');
  assert(
    past.some(
      (message) => JSON.stringify(JSON.parse(message.content).data) === JSON.stringify(previous),
    ),
  );
  const review = input.messages.find((message) =>
    message.content.startsWith('REVIEW FEEDBACK ON THE PREVIOUS RESULT\n'),
  );
  assert(review?.content.includes(rejected.reason));
};
const diagnostic = z.object({
  review: z
    .object({
      ok: z.boolean(),
      decision: z.object({ accepted: z.boolean(), reason: z.string() }).nullable(),
    })
    .nullable(),
  repair: z.object({ attempts: z.number(), reason: z.string().nullable() }),
  author: z.object({
    attempt: z.number().int().positive(),
    remaining: z.object({
      author: z.object({ steps: z.number() }),
      review: z.object({ steps: z.number() }),
    }),
  }),
});

{
  const replies = successReplies();
  replies['author.html'] = [
    propose(firstOnly),
    (input) => {
      assertOwnHistory(input, propose(firstOnly));
      assert(
        !input.messages.some(
          (message) => message.role === 'assistant' && message.content.includes('$flatMap'),
        ),
      );
      assert(input.messages.some((message) => message.content.includes('"canFollow":false')));
      return propose(rule);
    },
  ];
  replies['author.output'] = [
    htmlMapping,
    (input) => {
      assertOwnHistory(input, htmlMapping);
      assert(
        !input.messages.some(
          (message) => message.role === 'assistant' && message.content.includes('"action"'),
        ),
      );
      assert(!JSON.stringify(input.messages).includes('UNTRUSTED html SOURCE'));
      return htmlMapping;
    },
  ];
  replies['result.review'] = [rejected, verdict];
  const test = await setup({ replies });
  try {
    const result = await test.run({ allowLinkFollowing: false, linkDepth: 0, maxPages: 1 });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.deepEqual(result.outputSchema, resultSchema);
    const details = diagnostic.parse(result);
    assert.equal(details.review?.decision?.accepted, true);
    assert.equal(details.repair.attempts, 1);
    assert.equal(details.author.remaining.author.steps, discoveryProfile.author.maxModelSteps - 2);
    assert.equal(details.author.remaining.review.steps, discoveryProfile.review.maxModelSteps - 1);
    assert.deepEqual(
      test.gets,
      [url, url],
      'Repair reuses its owned source and the one-page charge',
    );
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
    assert(!JSON.stringify(result.artifact).includes(rejected.reason));
    assert(!JSON.stringify(result.artifact).includes('histories'));
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: source and mapping authors retain history/captures and receive fresh attempt allowances',
);

{
  const replies = successReplies();
  replies['author.html'] = [propose(firstOnly), propose(rule)];
  replies['author.output'] = [htmlMapping, htmlMapping];
  replies['result.review'] = [rejected, rejected];
  const test = await setup({ replies });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(diagnostic.parse(result).review?.decision?.accepted, false);
    assert.equal(diagnostic.parse(result).repair.attempts, 1);
    assert.equal(diagnostic.parse(result).author.attempt, 2);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
    assert.equal(test.models.filter((model) => model.name === 'result.review').length, 2);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: a still-rejected corrected artifact is returned after the configured repair bound',
);

{
  const replies = successReplies();
  replies['author.html'] = [propose(firstOnly), propose(rule)];
  replies['author.output'] = [htmlMapping, ...Array.from({ length: 4 }, () => ({ $const: 123 }))];
  replies['result.review'] = [rejected];
  const test = await setup({
    replies,
    profile: { author: { ...discoveryProfile.author, maxModelSteps: 5 } },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    const details = diagnostic.parse(result);
    assert.equal(details.author.remaining.author.steps, 0);
    assert(details.repair.reason?.includes('allowance exhausted'));
    assert.equal(details.review?.decision?.accepted, false);
    assert.deepEqual(result.outputSchema, resultSchema);
    assert.deepEqual(await test.replay(result.artifact), ['One']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: an invalid repair retains the previous working artifact, matching schema/verdict and spent allowance',
);

{
  const replies = successReplies();
  replies['author.html'] = [
    propose(firstOnly),
    (input) => {
      assert.equal(input.settings.maxSteps, 3);
      assertOwnHistory(input, propose(firstOnly));
      return propose(rule);
    },
  ];
  replies['author.output'] = [htmlMapping, htmlMapping];
  replies['result.review'] = [rejected, verdict];
  const test = await setup({
    replies,
    profile: { author: { ...discoveryProfile.author, maxModelSteps: 3 } },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(diagnostic.parse(result).repair.attempts, 1);
    assert.equal(diagnostic.parse(result).author.remaining.author.steps, 1);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] attempt budgets: a completely exhausted first author attempt still receives a full bounded correction attempt',
);

{
  const replies = successReplies();
  replies['author.html'] = [propose(firstOnly), propose(rule)];
  replies['result.contract'] = [
    schemaBody,
    (input) => {
      assertOwnHistory(input, schemaBody);
      return schemaBody;
    },
  ];
  replies['author.output'] = [htmlMapping, htmlMapping];
  replies['result.review'] = [rejected, verdict];
  const test = await setup({ replies });
  try {
    const result = await test.run({ outputSchema: undefined });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(test.models.filter((model) => model.name === 'result.contract').length, 2);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: the generated schema author retains its own history while caller schemas stay unchanged',
);

{
  const replies = successReplies();
  replies['result.review'] = [rejected];
  const test = await setup({
    replies,
    freshSource: source('<main/>', 'text/html', 403),
    profile: { review: { ...discoveryProfile.review, maxRepairs: 0 } },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'unresolved');
    assert.equal(result.artifact, null);
    assert(result.reason?.includes('Fresh complete artifact trial failed'));
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: advisory review never bypasses a failed fresh mechanical artifact trial',
);

{
  const secondRejection = {
    accepted: false,
    reason: 'A second review identifies another omission.',
  };
  const replies = successReplies();
  replies['author.html'] = [
    propose(firstOnly),
    propose(rule),
    (input) => {
      assertOwnHistory(input, propose(firstOnly));
      assertOwnHistory(input, propose(rule));
      assert(input.messages.some((message) => message.content.includes(secondRejection.reason)));
      assert.equal(
        input.messages.filter((message) =>
          message.content.startsWith('REVIEW FEEDBACK ON THE PREVIOUS RESULT\n'),
        ).length,
        2,
      );
      return propose(rule);
    },
  ];
  replies['author.output'] = [
    htmlMapping,
    htmlMapping,
    (input) => {
      assertOwnHistory(input, htmlMapping);
      assert(input.messages.some((message) => message.content.includes(secondRejection.reason)));
      assert.equal(
        input.messages.filter((message) =>
          message.content.startsWith('REVIEW FEEDBACK ON THE PREVIOUS RESULT\n'),
        ).length,
        2,
      );
      return htmlMapping;
    },
  ];
  replies['result.review'] = [rejected, secondRejection, verdict];
  const test = await setup({
    replies,
    profile: { review: { ...discoveryProfile.review, maxRepairs: 2 } },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(diagnostic.parse(result).repair.attempts, 2);
    assert.deepEqual(test.gets, [url, url]);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: configurable second repair retains both reviews and both earlier proposals without repeated source bodies',
);

{
  const nextUrl = 'https://grounded.invalid/next';
  const replies = successReplies();
  replies['author.html'] = [propose(firstOnly), propose({ ...firstOnly, links: 'a' })];
  replies['result.review'] = [rejected];
  const test = await setup({
    replies,
    source: source(html + '<a href="/next">Next</a>'),
    linkedSources: { [nextUrl]: { ...source('Blocked', 'text/html', 403), url: nextUrl } },
  });
  try {
    const result = await test.run({ allowLinkFollowing: true, linkDepth: 1, maxPages: 2 });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert(diagnostic.parse(result).repair.reason?.includes('Repair acquisition failed'));
    assert.equal(
      diagnostic.parse(result).author.remaining.author.steps,
      discoveryProfile.author.maxModelSteps - 1,
    );
    assert.deepEqual(test.gets, [url, nextUrl, url]);
    assert.deepEqual(await test.replay(result.artifact), ['One']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: blocked child acquisition preserves the last working artifact and the charged model allowance',
);

for (const mode of ['integrity', 'xml-limit'] as const) {
  const nextUrl = 'https://grounded.invalid/next';
  const replies = successReplies();
  replies['author.html'] = [propose(firstOnly), propose({ ...firstOnly, links: 'a' })];
  replies['result.review'] = [rejected, verdict];
  const next = {
    ...source(
      '<root><record>One</record></root>',
      mode === 'xml-limit' ? 'application/xml' : 'text/html',
    ),
    url: nextUrl,
  };
  if (mode === 'integrity') next.body = { ...next.body, sha256: 'incorrect' };
  const test = await setup({
    replies,
    source: source(html + '<a href="/next">Next</a>'),
    linkedSources: { [nextUrl]: next },
    ...(mode === 'xml-limit' ? { web: { xml: { ...readXmlProfile(), maxNodes: 2 } } } : {}),
  });
  try {
    await assert.rejects(
      test.raw({ allowLinkFollowing: true, linkDepth: 1, maxPages: 2 }),
      (error: unknown) =>
        error instanceof RunControl &&
        error.code === (mode === 'integrity' ? 'BODY_MISMATCH' : 'XML_LIMIT'),
    );
    assert.deepEqual(
      test.gets,
      [url, nextUrl],
      'Terminal controls cannot enter fresh fallback execution',
    );
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: corrupt capture and XML resource-limit failures remain terminal outside the JSON recovery boundary',
);

{
  const replies = successReplies();
  replies['author.html'] = [propose(firstOnly), propose(rule)];
  replies['author.output'] = [htmlMapping, htmlMapping];
  replies['result.review'] = [rejected, verdict];
  const test = await setup({
    replies,
    profile: { review: { ...discoveryProfile.review, maxModelSteps: 1 } },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(diagnostic.parse(result).review?.decision?.accepted, true);
    assert.equal(diagnostic.parse(result).author.remaining.review.steps, 0);
    assert.equal(test.models.filter((model) => model.name === 'result.review').length, 2);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] attempt budgets: exhausted reviewer allowance is renewed only for the next bounded attempt',
);

{
  const replies = successReplies();
  replies['author.html'] = [
    propose(firstOnly),
    (input) => {
      assert.equal(input.settings.maxSteps, 3);
      assert.equal(z.object({ maxMs: z.number() }).parse(input.settings).maxMs, 3);
      return propose(rule);
    },
  ];
  replies['author.output'] = [htmlMapping, htmlMapping];
  replies['result.review'] = [rejected, verdict];
  const test = await setup({
    replies,
    profile: { author: { ...discoveryProfile.author, maxModelSteps: 3, maxModelMs: 3 } },
  });
  try {
    const result = await test.run({ maxPages: 1 });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(diagnostic.parse(result).author.attempt, 2);
    assert.equal(
      z
        .object({
          author: z.object({ remaining: z.object({ author: z.object({ ms: z.number() }) }) }),
        })
        .parse(result).author.remaining.author.ms,
      1,
    );
    assert.deepEqual(test.gets, [url, url]);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] attempt budgets: exhausted author time and steps both refresh once, with the original one-page crawl ceiling',
);

{
  const replies = successReplies();
  replies['result.review'] = [rejected];
  const test = await setup({
    replies,
    profile: {
      author: { ...discoveryProfile.author, maxModelSteps: 3 },
      review: { ...discoveryProfile.review, maxRepairs: 0 },
    },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(diagnostic.parse(result).repair.attempts, 0);
    assert.equal(diagnostic.parse(result).author.attempt, 1);
  } finally {
    test.close();
  }
  const limited = createDiscoveryOperations({
    author: { apiKey: 'offline' },
    profile: { ...discoveryProfile, engine: { ...discoveryProfile.engine, maxActiveMs: 1500 } },
  });
  try {
    assert.equal(limited.limits.maxActiveMs, 1500);
  } finally {
    limited.close();
  }
}
console.log(
  '[pass] attempt budgets: zero repairs forbids a new attempt and a tighter caller whole-run deadline is preserved',
);

for (const format of ['json', 'xml'] as const) {
  const program = {
    $pluck: {
      over: { $ref: format === 'json' ? '$.input.document.rows' : '$.input.items' },
      key: 'label',
    },
  };
  const selection = { selector: '/root/record', namespaces: {}, fields: { label: 'string(.)' } };
  const replies: Record<string, Reply[]> = {
    'task.declare': [task],
    'author.output': [
      { $const: ['One'] },
      (input) => {
        assertOwnHistory(input, { $const: ['One'] });
        return program;
      },
    ],
    'result.review': [rejected, verdict],
    ...(format === 'xml'
      ? {
          'author.xml.selection': [
            propose(selection),
            (input: ModelInput) => {
              assertOwnHistory(input, propose(selection));
              return propose(selection);
            },
          ],
        }
      : {}),
  };
  const text =
    format === 'json'
      ? '{"rows":[{"label":"One"},{"label":"Two"}]}'
      : '<root><record>One</record><record>Two</record></root>';
  const test = await setup({ replies, source: source(text, 'application/' + format) });
  try {
    const result = await test.run({ maxPages: 1 });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.equal(diagnostic.parse(result).review?.decision?.accepted, true);
    assert.deepEqual(test.gets, [url, url]);
    assert.deepEqual(await test.replay(result.artifact, text, 'application/' + format), [
      'One',
      'Two',
    ]);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: JSON and XML use the same bounded feedback/history loop and AI-free corrected artifact execution',
);

{
  const resourceUrl = 'https://grounded.invalid/download.pdf';
  const resourceFlow = { id: 'fetch-resources', revision: 1 };
  const resourceRule = {
    preconditions: [],
    selector: 'a',
    links: null,
    fields: null,
    result: { reference: ['attributes', 'href'] },
  };
  const replies: Record<string, Reply[]> = {
    'task.declare': [{ requiresNavigation: false, resultFlow: resourceFlow }],
    'author.html': [propose(resourceRule), propose(resourceRule)],
    'author.output': [{ $ref: '$.input.resourceUrls' }, { $ref: '$.input.resourceUrls' }],
    'result.review': [rejected, verdict],
  };
  const test = await setup({
    replies,
    source: source('<a href="/download.pdf">File</a>'),
    linkedSources: {
      [resourceUrl]: { ...source('%PDF-offline-bytes', 'application/pdf'), url: resourceUrl },
    },
  });
  try {
    const result = await test.run({ allowResourceFetching: true, maxResources: 1, maxPages: 1 });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.deepEqual(
      test.gets,
      [url, resourceUrl, url, resourceUrl],
      'Repair must reuse its one charged resource; fresh verification has its independent allowance',
    );
    assert.deepEqual(
      z
        .object({
          value: z.object({ data: z.json(), resources: z.object({ items: z.array(z.json()) }) }),
        })
        .parse(result.trial).value.data,
      [resourceUrl],
    );
    assert.equal(
      z
        .object({ value: z.object({ resources: z.object({ items: z.array(z.json()) }) }) })
        .parse(result.trial).value.resources.items.length,
      1,
    );
    assert.deepEqual(await test.replay(result.artifact, '<a href="/download.pdf">File</a>'), [
      resourceUrl,
    ]);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] review feedback: resource captures and the one-resource caller allowance survive repair without another download',
);

{
  const replies = successReplies();
  replies['author.html'] = [
    propose({ ...rule, selector: '[' }),
    { action: 'inspect', source: 99, query: { selector: 'main' }, window: { offset: 0, limit: 1 } },
    propose(rule),
  ];
  const test = await setup({ replies });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.deepEqual(test.gets, [url, url], 'Unknown inspection cannot add any acquisition');
    const retry = test.models.filter((entry) => entry.name === 'author.html').at(-1);
    assert(retry && JSON.stringify(retry.input.messages).includes('SOURCE_NOT_OWNED'));
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: unknown source inspection produces feedback without fetching an unowned URL',
);

{
  const replies = successReplies();
  const test = await setup({
    replies,
    profile: { author: { maxModelSteps: 2, maxResponseAttempts: 3, maxModelMs: 300000 } },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'unresolved');
    assert.equal(result.artifact, null);
    assert(result.reason);
    assert.equal(test.models.length, 2, 'Task and proposal share one model-step budget');
    assert.equal(test.models[1]?.input.settings.maxSteps, 1);
    assert.equal(test.models[1]?.input.settings.outputAttempts, 1);
    assert.deepEqual(test.gets, [url]);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: author allowance does not reset between phases of the same attempt',
);

{
  const test = await setup({
    replies: successReplies(),
    freshSource: source('Not found', 'text/plain', 404),
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'unresolved');
    assert.equal(result.artifact, null);
    assert(result.reason);
    assert(result.partialTrial);
    assert.equal(test.gets.length, 2);
    assert.equal(test.models.filter((entry) => entry.name === 'result.review').length, 1);
    assert.equal(
      test.models.length,
      4,
      'Fresh trial failure is terminal, with no new repair cycle',
    );
  } finally {
    test.close();
  }
}
console.log(
  '[pass] grounded discovery: failed fresh trial cannot publish or start another model cycle',
);

{
  for (const format of ['json', 'xml'] as const) {
    const replies: Record<string, Reply[]> = {
      'task.declare': [task],
      'author.output': [
        {
          $map: {
            over: { $ref: format === 'json' ? '$.input.document.rows' : '$.input.items' },
            as: 'record',
            body: { $get: { from: { $var: 'record' }, path: ['label'] } },
          },
        },
      ],
      'result.review': [verdict],
    };
    if (format === 'xml')
      replies['author.xml.selection'] = [
        propose({ selector: '/root/record', namespaces: {}, fields: { label: 'string(.)' } }),
      ];
    const original =
      format === 'json'
        ? JSON.stringify({ rows: [{ label: 'One' }, { label: 'Two' }] })
        : '<root><record>One</record><record>Two</record></root>';
    const changed =
      format === 'json'
        ? JSON.stringify({ rows: [{ label: 'Changed' }, { label: 'Added' }, { label: 'Third' }] })
        : '<root><record>Changed</record><record>Added</record><record>Third</record></root>';
    const test = await setup({ replies, source: source(original, 'application/' + format) });
    try {
      const result = await test.run();
      assert.equal(result.status, 'ready');
      assert(result.artifact);
      assert.deepEqual(await test.replay(result.artifact, original, 'application/' + format), [
        'One',
        'Two',
      ]);
      assert.deepEqual(await test.replay(result.artifact, changed, 'application/' + format), [
        'Changed',
        'Added',
        'Third',
      ]);
      assert.equal(
        test.models.some((entry) => entry.name.startsWith('author.html')),
        false,
      );
    } finally {
      test.close();
    }
  }
}
console.log(
  '[pass] grounded discovery: JSON and XML use the same final contract/review and AI-free reusable execution',
);

for (const limit of [0, 1, 3]) {
  const replies = successReplies();
  const inspect: JsonValue = {
    action: 'inspect',
    source: 0,
    query: { selector: limit === 1 ? '[' : 'article' },
    window: { offset: 0, limit: 2 },
  };
  replies['author.html'] = [
    propose({ ...rule, selector: '[' }),
    ...Array.from({ length: limit }, () => inspect),
    propose(rule),
  ];
  const test = await setup({
    replies,
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    const sourceCalls = test.models.filter((m) => m.name.startsWith('author.html'));
    if (limit === 3)
      assert(
        sourceCalls
          .at(-1)
          ?.input.messages.some((message) => message.content.includes('"repeated":true')),
      );
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] author evidence: rejected proposals and zero/one/three inspections share the author allowance without forced reproposal',
);

{
  const nine = Array.from(
    { length: 9 },
    (_, i) =>
      `<article><h2>Record ${i + 1}</h2>${i === 3 ? '<h2>Alternate label</h2>' : ''}${i === 5 ? '' : `<p>Description ${i + 1}</p>`}</article>`,
  ).join('');
  const partialHtml = '<main>' + nine + '</main>';
  const partialRule = {
    selector: 'main article',
    links: null,
    fields: {
      name: { selector: 'h2', attribute: null },
      summary: { selector: 'p', attribute: null },
    },
    result: null,
  };
  const partialBody = {
    type: 'array',
    description: 'Requested records.',
    items: {
      type: 'object',
      description: 'One record.',
      properties: {
        name: { type: 'string', description: 'Record label.' },
        summary: { type: 'string', description: 'Record description.' },
      },
      required: ['name', 'summary'],
      additionalProperties: false,
    },
  };
  const partialProgram = {
    $map: {
      over: { $ref: '$.input.records' },
      as: 'row',
      body: {
        name: { $get: { from: { $var: 'row' }, path: ['fields', 'name', 0], fallback: null } },
        summary: {
          $get: { from: { $var: 'row' }, path: ['fields', 'summary', 0], fallback: null },
        },
      },
    },
  };
  const replies: Record<string, Reply[]> = {
    'task.declare': [task],
    'author.html': [
      propose(partialRule),
      ...Array.from({ length: discoveryProfile.author.maxModelSteps }, () =>
        propose({ ...partialRule, selector: '[' }),
      ),
    ],
    'result.contract': [partialBody],
    'author.output': [partialProgram],
    'result.review': [
      {
        accepted: false,
        reason:
          'Nine available records rather than ten; one description is unavailable. The supplied records remain useful.',
      },
    ],
  };
  const test = await setup({ replies, source: source(partialHtml) });
  try {
    const result = await test.run({
      outputSchema: undefined,
      instruction: 'Return the top ten record names and descriptions.',
    });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    const value = z
      .object({
        review: z.object({
          decision: z.object({ accepted: z.literal(false), reason: z.string() }),
        }),
        repair: z.object({ attempts: z.literal(1) }),
      })
      .parse(result);
    assert(value.review.decision.reason.includes('Nine'));
    const expected = Array.from({ length: 9 }, (_, i) => ({
      name: `Record ${i + 1}`,
      summary: i === 5 ? null : `Description ${i + 1}`,
    }));
    assert.deepEqual(await test.replay(result.artifact, partialHtml), expected);
    const schema = z
      .object({
        items: z.object({
          required: z.array(z.string()),
          properties: z.object({ summary: z.object({ anyOf: z.array(z.json()) }) }),
        }),
      })
      .parse(result.outputSchema);
    assert.deepEqual(schema.items.required, []);
    assert(
      schema.items.properties.summary.anyOf.some((s) => JSON.stringify(s) === '{"type":"null"}'),
    );
    const artifact = z
      .object({
        data: z.object({
          rules: z.array(
            z.object({
              preconditions: z.array(z.json()),
              fields: z.record(z.string(), z.object({ minimum: z.literal(0), maximum: z.null() })),
            }),
          ),
        }),
      })
      .parse(result.artifact);
    assert.deepEqual(artifact.data.rules[0]?.preconditions, []);
  } finally {
    test.close();
  }
  const strictReplies: Record<string, Reply[]> = {
    'task.declare': [task],
    'author.html': [propose(partialRule)],
    'author.output': Array.from({ length: 4 }, () => partialProgram),
  };
  const callerSchema = {
    ...partialBody,
    minItems: 10,
    items: {
      ...partialBody.items,
      properties: {
        ...partialBody.items.properties,
        summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['name'],
    },
  };
  const strict = await setup({
    replies: strictReplies,
    source: source(partialHtml),
    profile: { author: { ...discoveryProfile.author, maxModelSteps: 4 } },
  });
  try {
    const result = await strict.run({ outputSchema: callerSchema });
    assert.equal(result.status, 'unresolved');
    assert.equal(result.artifact, null);
    assert.deepEqual(result.outputSchema, callerSchema);
    assert(!strict.models.some((m) => m.name === 'result.contract'));
  } finally {
    strict.close();
  }
}
console.log(
  '[pass] best effort: nine records and missing/multiple fields survive negative review and failed repair; explicit caller minItems remains strict',
);

{
  const inspect = (offset: number) => ({
    action: 'inspect',
    source: 0,
    query: { selector: 'article', fields: null },
    window: { offset, limit: 1 },
  });
  const replies = successReplies();
  replies['author.html'] = [() => inspect(0), () => inspect(1), () => propose(rule)];
  const test = await setup({
    replies,
    source: source('<aside>' + 'x'.repeat(20000) + '</aside>' + html),
    profile: {
      htmlContext: { ...discoveryProfile.htmlContext, maxInlineBytes: 4096 },
    },
  });
  try {
    const result = await test.run();
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] oversized discovery: HTML is supplied initially and inspections remain available until the shared author allowance is spent',
);

for (const verdict of ['reject', 'exhaust'] as const) {
  const replies = successReplies();
  replies['result.review'] = [
    {
      action: 'inspect',
      source: 0,
      query: { selector: 'article', fields: null },
      window: { offset: 0, limit: 1 },
    },
    ...(verdict === 'reject'
      ? [
          {
            accepted: false,
            reason: 'Two usable records are available; the requested third record is absent.',
          },
        ]
      : []),
  ];
  const test = await setup({
    replies,
    profile: {
      review: {
        ...discoveryProfile.review,
        maxRepairs: 0,
        maxModelSteps: verdict === 'exhaust' ? 1 : 4,
      },
    },
  });
  try {
    const result = await test.run({ instruction: 'Return the first three record labels.' });
    assert.equal(result.status, 'ready');
    assert(result.artifact);
    const review = z
      .object({ ok: z.boolean(), decision: z.object({ accepted: z.boolean() }).nullable() })
      .parse(result.review);
    assert.equal(review.ok, verdict === 'reject');
    assert.equal(review.decision?.accepted ?? null, verdict === 'reject' ? false : null);
    const calls = test.models.length;
    assert.deepEqual(await test.replay(result.artifact), ['One', 'Two']);
    assert.equal(test.models.length, calls);
  } finally {
    test.close();
  }
}
console.log(
  '[pass] reviewer inspection: partial working artifacts survive both negative and exhausted review and execute without AI',
);
