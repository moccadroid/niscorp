import assert from 'node:assert/strict';
import { z } from 'zod';
import { mappingAgent } from '@niscorp/prism/agent';
import { prepareArtifact, defineOperation } from '../src/index.js';
import { createDiscoveryOperations, discoveryWorkflow } from '../src/discovery/index.js';
import { DiscoveryResultSchema } from '../src/discovery/discovery-result.schema.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import type { JsonValue } from '../src/engine/contracts.js';
import { discoveryProfile } from '../src/discovery/index.js';
import { blueprint } from '../src/discovery/blueprint.js';
import { readXmlProfile } from '../src/readers/xml/index.js';

// The actual Cortex/Signal/published Prism path runs against controlled provider replies.
// This proves ownership and mechanical correction, not real-model accuracy.
const origin = 'https://xml-ownership.invalid';
const url = origin + '/catalog';
const original =
  '<c:catalog xmlns:c="urn:catalog"><c:entry><c:page>/first</c:page><c:file>/unwanted</c:file></c:entry></c:catalog>';
let xml = original;
const gets: string[] = [];
const provider: { messages: { role: string; content: string }[] }[] = [];
const selected: JsonValue[] = [];
let xpathCalls = 0;
const originalFetch = globalThis.fetch;
const runtime = createWebOperations();
const http = defineOperation({
  input: z.object({ url: z.string() }).strict(),
  output: HttpSourceSchema,
  run(input) {
    gets.push(input.url);
    assert.notEqual(input.url, origin + '/unwanted');
    const text =
      input.url === url ? xml : '<main><p>' + new URL(input.url).pathname.slice(1) + '</p></main>';
    const body = captureBody(Buffer.from(text));
    return {
      url: input.url,
      status: 200,
      headers: { 'content-type': [input.url === url ? 'application/xml' : 'text/html'] },
      body,
      encoded: body,
    };
  },
});
globalThis.fetch = async (target, init) => {
  assert.equal(new URL(String(target)).hostname, 'api.groq.com');
  const wire = z
    .object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) })
    .parse(JSON.parse(String(init?.body)));
  provider.push(wire);
  const has = (prefix: string): boolean => wire.messages.some((m) => m.content.startsWith(prefix));
  let decision: JsonValue;
  if (has('OFFERED RESULT FLOWS\n')) {
    decision = { requiresNavigation: true, resultFlow: null };
  } else if (has('UNTRUSTED xml SOURCE')) {
    xpathCalls++;
    assert.deepEqual(gets, [url], 'An unready extraction/mapping pair cannot acquire children');
    assert(wire.messages.some((m) => m.content.includes(original)));
    assert(!wire.messages.some((m) => m.content === mappingAgent.config.instructions));
    const offered = wire.messages.find((m) => m.content.startsWith('OUTPUT SCHEMA'));
    assert(offered);
    assert(
      !offered.content.includes('"mapping"'),
      'XPath author must not receive a Prism candidate schema',
    );
    if (xpathCalls > 1) {
      const feedback = wire.messages.find((m) => m.content.startsWith('CURRENT FEEDBACK\n'));
      assert(feedback);
      assert(feedback.content.includes('E_MISSING_PATH'));
      assert.match(feedback.content, /"op":"\$get"/);
      assert(feedback.content.includes('/unwanted'));
    }
    decision = {
      action: 'propose',
      candidate: {
        selector: '/x:catalog/x:entry',
        namespaces: { x: 'urn:catalog' },
        fields: xpathCalls === 1 ? { file: 'string(x:file)' } : { next: 'string(x:page)' },
      },
    };
  } else if (has('REFERENCE ACTION CEILING\n')) {
    assert.equal(wire.messages[0]?.content, mappingAgent.config.instructions);
    assert(!has('UNTRUSTED xml SOURCE'));
    const examples = wire.messages.find((m) => m.content.startsWith('EXAMPLE PROGRAM CONTEXTS'));
    assert(examples);
    selected.push(
      z.json().parse(JSON.parse(examples.content.slice(examples.content.indexOf('\n') + 1))),
    );
    if (selected.length > 1) {
      assert(JSON.stringify(wire.messages).includes('E_MISSING_PATH'));
      const feedback = wire.messages.find((message) =>
        message.content.startsWith('CURRENT REFERENCE FEEDBACK\n'),
      );
      assert(feedback);
      assert.match(feedback.content, /"op":"\$get"/);
    }
    decision = {
      links: { $pluck: { over: { $ref: '$.input.items' }, key: 'next' } },
      resources: [],
    };
  } else if (has('SOURCE AUTHORING CONTEXT\n')) {
    decision = {
      action: 'propose',
      candidate: { selector: 'main p', fields: null, links: null, result: null },
    };
  } else if (has('CURRENT MAPPING FEEDBACK\n')) {
    assert.equal(wire.messages[0]?.content, mappingAgent.config.instructions);
    decision = { $pluck: { over: { $ref: '$.input.records' }, key: 'text' } };
  } else {
    decision = { accepted: true, reason: 'Controlled final review.' };
  }
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [
          {
            index: 0,
            delta: { content: JSON.stringify({ data: decision }) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );
};
const discovery = createDiscoveryOperations({
  author: { apiKey: 'offline-only' },
  mechanical: { 'http.get': http },
});
try {
  assert(!Object.hasOwn(discovery.operations, 'author.xml.reference'));
  const workflow = await prepareArtifact(discoveryWorkflow, discovery.operations, discovery.limits);
  const result = await workflow.run({
    url,
    instruction: 'Follow the document links and return all labels.',
    outputSchema: { type: 'array', items: { type: 'string' } },
    allowLinkFollowing: true,
    linkDepth: 1,
    maxPages: 3,
  });
  assert.equal(result.status, 'completed', JSON.stringify(result));
  const output = DiscoveryResultSchema.parse(result.value);
  assert.equal(output.status, 'ready', JSON.stringify(output));
  assert(output.artifact);
  assert.deepEqual(z.object({ data: z.json() }).parse(output.trial?.value).data, ['first']);
  assert.equal(xpathCalls, 2);
  assert.deepEqual(selected, [
    [{ input: { url, items: [{ file: '/unwanted' }] } }],
    [{ input: { url, items: [{ next: '/first' }] } }],
  ]);
  const beforeModels = provider.length;
  const artifact = await prepareArtifact(output.artifact, {
    ...runtime.operations,
    'http.get': http,
  });
  xml =
    '<n:catalog xmlns:n="urn:catalog"><n:entry><n:page>/changed</n:page></n:entry><n:entry><n:page>/added</n:page></n:entry></n:catalog>';
  const changed = await artifact.run({ url });
  assert.equal(changed.status, 'completed');
  assert.deepEqual(z.object({ data: z.json() }).parse(changed.value).data, ['changed', 'added']);
  xml = '<catalog xmlns="urn:catalog"/>';
  const empty = await artifact.run({ url });
  assert.equal(empty.status, 'completed');
  assert.deepEqual(z.object({ data: z.json() }).parse(empty.value).data, []);
  assert.equal(provider.length, beforeModels);
  console.log(
    '[pass] XML reference ownership: XPath-only author, actual published Prism mapper, paired correction before traversal, changed/added/empty/namespace replay without AI',
  );
} finally {
  discovery.close();
  runtime.close();
  globalThis.fetch = originalFetch;
}

for (const mode of [
  'selected-limit',
  'integrity',
  'cancel-during-trial',
  'xpath-feedback',
] as const) {
  const signal = new AbortController();
  const web = createWebOperations({
    xml: {
      ...readXmlProfile(),
      ...(mode === 'selected-limit' ? { maxSelectedItems: 1 } : {}),
    },
  });
  const select = web.operations['xml.select'];
  assert(select);
  let selections = 0,
    models = 0,
    httpEffects = 0;
  const native = createDiscoveryOperations({
    author: { apiKey: 'forbidden-offline' },
    mechanical: {
      'http.get': defineOperation({
        input: z.json(),
        output: z.json(),
        run() {
          httpEffects++;
          throw Error('A captured pair must never acquire HTTP');
        },
      }),
      'xml.select': {
        ...select,
        async run(input, context) {
          selections++;
          if (mode === 'cancel-during-trial' && selections === 2) signal.abort();
          return select.run(input, context);
        },
      },
    },
  });
  const operations = {
    ...native.operations,
    'author.reference': defineOperation({
      input: z.json(),
      output: z.json(),
      run() {
        models++;
        assert.equal(
          mode,
          'cancel-during-trial',
          'Control/query failures must stop before mapping',
        );
        return {
          ok: true,
          decision: { links: ['/destination'], resources: [] },
          error: null,
          meta: {
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false },
            strategy: 'emit',
            steps: 1,
            outputRetries: 0,
            elapsedMs: 1,
          },
          rawSources: [],
        };
      },
    }),
  };
  try {
    const helper = discoveryWorkflow.flows?.find((flow) => flow.id === 'test-xml-reference');
    assert(helper);
    const prepared = await prepareArtifact(
      {
        stamp: discoveryWorkflow.stamp,
        data: discoveryWorkflow.data,
        flow: helper.flow,
        flows: discoveryWorkflow.flows,
      },
      operations,
      native.limits,
    );
    const text =
      '<x:catalog xmlns:x="urn:catalog"><x:entry><x:page>/one</x:page></x:entry><x:entry><x:page>/two</x:page></x:entry></x:catalog>';
    const body = captureBody(Buffer.from(text));
    const source = {
      url,
      status: 200,
      headers: { 'content-type': ['application/xml'] },
      encoded: body,
      body: mode === 'integrity' ? { ...body, sha256: '0'.repeat(64) } : body,
    };
    const input = {
      level: {
        depth: 0,
        format: 'xml',
        frontier: [url],
        sources: [{ url, sha256: body.sha256 }],
        redirects: [],
        reference: true,
        standalone: false,
        ready: false,
        trials: [],
        rule: {
          preconditions: [],
          selector: null,
          links: null,
          result: null,
          reference: { id: 'document-reference:0', format: 'xml', xml: null },
        },
      },
      sources: [source],
      task: { requiresNavigation: true, resultFlow: null },
      blueprint,
      policy: { ...discoveryProfile.traversal, allowLinkFollowing: true },
      authoring: discoveryProfile.authoring,
      resources: discoveryProfile.resources,
      formats: discoveryProfile.formats,
      resultFlows: discoveryProfile.resultFlows,
      htmlContext: {
        enabled: discoveryProfile.htmlContext.enabled,
        policy: discoveryProfile.htmlContext.policy,
      },
      diagnostics: discoveryProfile.diagnostics,
      minimumResultMatches: discoveryProfile.minimumResultMatches,
      xml: {
        selector: mode === 'xpath-feedback' ? '/x:catalog[' : '/x:catalog/x:entry',
        namespaces: { x: 'urn:catalog' },
        fields: { next: 'string(x:page)' },
      },
      instruction: 'Follow document references.',
      asOf: null,
      settings: discoveryProfile.settings,
      responseAttempts: discoveryProfile.author.maxResponseAttempts,
      maxInputBytes: discoveryProfile.maxInputBytes,
      allowance: { steps: 2, ms: 1000 },
      histories: [],
      repairFeedback: null,
      repairCount: 0,
      feedback: { failure: null, inspection: null },
      observationMaxBytes: discoveryProfile.observations.maxBytes,
    };
    if (mode === 'xpath-feedback') {
      const outcome = await prepared.run(input);
      assert.equal(outcome.status, 'completed');
      const result = z
        .object({
          reason: z.null(),
          level: z.object({ ready: z.literal(false) }),
          feedback: z.object({
            failure: z.object({
              trials: z.array(z.object({ error: z.object({ code: z.literal('XML_XPATH') }) })),
            }),
          }),
        })
        .parse(outcome.value);
      assert(result.feedback.failure.trials.length > 0);
    } else {
      await assert.rejects(prepared.run(input, { signal: signal.signal }), {
        code:
          mode === 'integrity'
            ? 'BODY_MISMATCH'
            : mode === 'selected-limit'
              ? 'XML_LIMIT'
              : 'CANCELLED',
      });
    }
    assert.equal(models, mode === 'cancel-during-trial' ? 1 : 0);
    assert.equal(httpEffects, 0);
    console.log(`[pass] XML reference boundary: ${mode}`);
  } finally {
    native.close();
    web.close();
  }
}
