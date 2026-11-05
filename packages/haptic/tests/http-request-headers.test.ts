import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { prepareArtifact } from '../src/index.js';
import { createWebOperations, WebProfileSchema } from '../src/operations/index.js';
import { createDiscoveryOperations, discoveryWorkflow } from '../src/discovery/index.js';
import { blueprint } from '../src/discovery/blueprint.js';
import { HttpSourceSchema } from '../src/operations/http-source.js';
import defaults from '../src/operations/default-profile.json' with { type: 'json' };

const received: { headers: IncomingHttpHeaders; raw: string[] }[] = [];
const server = createServer((request, response) => {
  received.push({ headers: request.headers, raw: request.rawHeaders });
  if (!request.headers['user-agent']) {
    response.writeHead(403);
    response.end('A request identity is required.');
  } else if (request.url === '/redirect') {
    response.writeHead(302, { location: '/page' });
    response.end();
  } else {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<main><p>Current record</p></main>');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const url = 'http://127.0.0.1:' + address.port;
const settings = { requestHeaders: { 'User-Agent': 'Host/7', 'X-Profile': 'configured' } };
const web = createWebOperations();
const configured = createWebOperations(settings);
settings.requestHeaders['User-Agent'] = 'changed-after-factory';
const anonymous = createWebOperations({ requestHeaders: {} });
const discovery = createDiscoveryOperations({ author: { apiKey: 'offline-unused' } });
const invoke = async (registry: typeof web.operations, headers?: Record<string, string>) => {
  const operation = registry['http.get'];
  assert(operation);
  return HttpSourceSchema.parse(
    await operation.run(
      { url: url + '/page', ...(headers === undefined ? {} : { headers }) },
      { signal: AbortSignal.timeout(10000) },
    ),
  );
};
try {
  assert.equal((await invoke(anonymous.operations)).status, 403);
  assert.equal((await invoke(web.operations)).status, 200);
  assert.equal(received.at(-1)?.headers['user-agent'], defaults.requestHeaders['user-agent']);
  await invoke(web.operations, { Accept: 'text/html' });
  assert.equal(received.at(-1)?.headers['user-agent'], defaults.requestHeaders['user-agent']);
  assert.equal(received.at(-1)?.headers.accept, 'text/html');
  console.log(
    '[pass] HTTP request defaults: JSON identity permits acquisition; empty host defaults disable it and unrelated request headers retain it',
  );

  await invoke(configured.operations, { 'uSeR-aGeNt': 'Caller/2', 'x-profile': 'request' });
  assert.equal(received.at(-1)?.headers['user-agent'], 'Caller/2');
  assert.equal(received.at(-1)?.headers['x-profile'], 'request');
  assert.equal(
    received.at(-1)?.raw.filter((name, i) => i % 2 === 0 && name.toLowerCase() === 'user-agent')
      .length,
    1,
  );
  await invoke(configured.operations);
  assert.equal(received.at(-1)?.headers['user-agent'], 'Host/7');
  assert.equal(received.at(-1)?.headers['x-profile'], 'configured');
  assert.equal((await invoke(web.operations)).status, 200);
  assert.equal(received.at(-1)?.headers['user-agent'], defaults.requestHeaders['user-agent']);
  console.log(
    '[pass] HTTP request defaults: case-insensitive overrides, owned mutable settings and independent factories',
  );

  const artifact = {
    stamp: discoveryWorkflow.stamp,
    flows: blueprint.flows,
    flow: {
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      steps: [
        {
          id: 'acquired',
          call: { flow: { id: 'fetch', revision: 2 } },
          input: {
            url: { $ref: '$.input.url' },
            remaining: 1,
            seen: [],
            accept: { statuses: [200], mediaTypes: ['text/html'] },
          },
        },
      ],
      output: { $ref: '$.steps.acquired.value' },
    },
  };
  const before = received.length;
  const first = await (
    await prepareArtifact(artifact, discovery.operations, discovery.limits)
  ).run({ url: url + '/redirect' });
  assert.equal(first.status, 'completed', JSON.stringify(first));
  const execution = await (
    await prepareArtifact(JSON.parse(JSON.stringify(artifact)), web.operations, discovery.limits)
  ).run({ url: url + '/redirect' });
  assert.equal(execution.status, 'completed', JSON.stringify(execution));
  assert.equal(received.length - before, 4);
  assert(
    received
      .slice(before)
      .every((request) => request.headers['user-agent'] === defaults.requestHeaders['user-agent']),
  );
  console.log(
    '[pass] HTTP request defaults: unchanged shared JSON fetch/redirect helper works in discovery and AI-free artifact execution',
  );

  const effects = received.length;
  await assert.rejects(invoke(web.operations, { 'user-agent': 'invalid\nvalue' }));
  assert.equal(received.length, effects, 'Malformed headers cannot reach HTTP');
  assert(!WebProfileSchema.safeParse({ requestHeaders: { 'user-agent': 7 } }).success);
  console.log('[pass] HTTP request defaults: invalid profile/header values fail before HTTP');
} finally {
  discovery.close();
  web.close();
  configured.close();
  anonymous.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
