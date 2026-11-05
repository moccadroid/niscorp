import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { providerRegistry } from '@niscorp/signal';
import { prepareArtifact } from '../src/index.js';
import { createWebOperations } from '../src/operations/index.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';

const html =
  '<nav>wire-source-only-sentinel</nav><main><article>One</article><article>Two</article></main>';
const firstRule = {
  selector: 'article:first-child',
  links: null,
  fields: null,
  result: null,
};
const secondRule = { ...firstRule, selector: 'article' };
const mapping = { $pluck: { over: { $ref: '$.input.records' }, key: 'text' } };
const rejection = 'The second requested record is missing.';
const requestSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});
const captures: { job: string; messages: z.infer<typeof requestSchema>['messages'] }[] = [];
let sources = 0,
  authors = 0,
  outputs = 0,
  reviews = 0;
let serverFailure: unknown;
const server = createServer((request, response) => {
  void (async () => {
    if (request.method === 'GET') {
      sources++;
      response.setHeader('content-type', 'text/html');
      response.end(html);
      return;
    }
    let body = '';
    for await (const part of request) body += part;
    const { messages } = requestSchema.parse(JSON.parse(body));
    let data: unknown, job: string;
    const past = messages.filter((message) => message.role === 'assistant');
    if (messages.some((message) => message.content.startsWith('OFFERED RESULT FLOWS\n'))) {
      job = 'task';
      data = { requiresNavigation: false, resultFlow: null };
    } else if (
      messages.some((message) => message.content.startsWith('SOURCE AUTHORING CONTEXT\n'))
    ) {
      job = 'source';
      authors++;
      if (authors === 2) {
        assert(
          past.some(
            (message) =>
              JSON.stringify(JSON.parse(message.content).data.candidate) ===
              JSON.stringify(firstRule),
          ),
        );
        assert(
          messages.some(
            (message) =>
              message.content.startsWith('REVIEW FEEDBACK ON THE PREVIOUS RESULT\n') &&
              message.content.includes(rejection),
          ),
        );
        assert.equal(
          messages.filter((message) => message.content.startsWith('UNTRUSTED html SOURCE\n'))
            .length,
          1,
        );
      }
      data = { action: 'propose', candidate: authors === 1 ? firstRule : secondRule };
    } else if (
      messages.some((message) => message.content.startsWith('CURRENT MAPPING FEEDBACK\n'))
    ) {
      job = 'output';
      outputs++;
      if (outputs === 2) {
        assert(
          past.some(
            (message) =>
              JSON.stringify(JSON.parse(message.content).data) === JSON.stringify(mapping),
          ),
        );
        assert(messages.some((message) => message.content.includes(rejection)));
        assert(!messages.some((message) => message.content.includes('wire-source-only-sentinel')));
        assert(!past.some((message) => message.content.includes('"action"')));
      }
      data = mapping;
    } else {
      job = 'review';
      reviews++;
      const current = messages.find((message) => message.content.startsWith('DATA TO REVIEW\n'));
      assert(current);
      assert.deepEqual(
        JSON.parse(current.content.slice(current.content.indexOf('\n') + 1)),
        reviews === 1 ? ['One'] : ['One', 'Two'],
      );
      data = {
        accepted: reviews !== 1,
        reason: reviews === 1 ? rejection : 'Controlled complete result.',
      };
    }
    captures.push({ job, messages });
    response.setHeader('content-type', 'text/event-stream');
    response.end(
      'data: ' +
        JSON.stringify({
          id: 'offline-feedback-wire',
          choices: [
            { index: 0, delta: { content: JSON.stringify({ data }) }, finish_reason: 'stop' },
          ],
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  })().catch((error: unknown) => {
    serverFailure = error;
    response.statusCode = 400;
    response.end('Offline protocol check failed');
  });
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const discovery = createDiscoveryOperations({
  author: { apiKey: 'offline' },
  profile: {
    ...discoveryProfile,
    provider: {
      adapter: 'openai-compatible',
      baseUrl: origin + '/v1',
      wire:
        providerRegistry.groq?.adapter === 'openai-compatible' ? providerRegistry.groq.wire : [],
    },
  },
});
const web = createWebOperations();
try {
  const result = await (
    await prepareArtifact(discoveryWorkflow, discovery.operations, discovery.limits)
  ).run({
    url: origin + '/records',
    instruction: 'Return all record labels.',
    outputSchema: { type: 'array', items: { type: 'string' } },
    maxPages: 1,
  });
  assert.equal(serverFailure, undefined);
  assert.equal(result.status, 'completed');
  assert.equal(
    z.object({ status: z.string() }).parse(result.value).status,
    'ready',
    JSON.stringify(result.value),
  );
  const value = z
    .object({
      status: z.literal('ready'),
      artifact: z.json(),
      review: z.object({ decision: z.object({ accepted: z.literal(true) }) }),
      repair: z.object({ attempts: z.literal(1) }),
      trial: z.object({ value: z.object({ data: z.json() }) }),
    })
    .parse(result.value);
  assert.deepEqual(value.trial.value.data, ['One', 'Two']);
  assert.equal(sources, 2, 'Owned capture reused during repair; one final fresh mechanical check');
  assert.deepEqual(
    captures.map((capture) => capture.job),
    ['task', 'source', 'output', 'review', 'source', 'output', 'review'],
  );
  const before = captures.length;
  const replay = await (
    await prepareArtifact(value.artifact, web.operations)
  ).run({ url: origin + '/records' });
  assert.equal(replay.status, 'completed');
  assert.deepEqual(z.object({ data: z.json() }).parse(replay.value).data, ['One', 'Two']);
  assert.equal(captures.length, before);
  assert.equal(sources, 3);
  const directory = resolve(
    'data/runs',
    'review-feedback-wire-' + new Date().toISOString().replaceAll(/[:.]/g, '-'),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'requests.json'), JSON.stringify(captures, null, 2) + '\n');
  await writeFile(resolve(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(
    '[pass] review feedback wire: seven local Cortex requests preserve own assistant history and review feedback; independent execution uses zero AI. Evidence: ' +
      directory,
  );
} finally {
  discovery.close();
  web.close();
  server.closeAllConnections();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}
