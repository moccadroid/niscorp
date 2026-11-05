import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { createWebOperations } from '../src/operations/index.js';
import { blueprint as mechanical } from '../src/discovery/blueprint.js';
import download from './fixtures/http-pdf-download.json' with { type: 'json' };

const pdf = Buffer.from('%PDF-1.7\ncontrolled original bytes');
const server = createServer((request, response) => {
  const path = request.url ?? '/';
  const status = /^\/status\/(\d+)$/.exec(path)?.[1];
  if (status) {
    response.writeHead(Number(status), { location: '/page' });
    response.end();
  } else if (path === '/chain') {
    response.writeHead(301, { location: '/status/307' });
    response.end();
  } else if (path === '/page') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<meta name="citation_pdf_url" content="/file-redirect">');
  } else if (path === '/file-redirect') {
    response.writeHead(302, { location: '/file' });
    response.end();
  } else if (path === '/file') {
    response.writeHead(200, { 'content-type': 'application/pdf' });
    response.end(pdf);
  } else if (path === '/loop') {
    response.writeHead(308, { location: '/loop' });
    response.end();
  } else if (path === '/missing-location') {
    response.writeHead(303);
    response.end();
  } else if (path.startsWith('/hops/')) {
    const n = Number(path.slice('/hops/'.length));
    response.writeHead(302, { location: n > 0 ? '/hops/' + (n - 1) : '/page' });
    response.end();
  } else {
    response.writeHead(404, { 'content-type': 'text/html' });
    response.end('not found');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = 'http://127.0.0.1:' + address.port;
const web = createWebOperations();
const helpers = mechanical.flows.filter((flow) => ['fetch', 'redirect'].includes(flow.id));
const resultSchema = z.object({
  page: z.object({ status: z.number() }),
  redirects: z.array(z.object({ status: z.number() })),
  files: z.array(
    z.object({
      source: z.object({ body: z.object({ base64: z.string() }) }),
      redirects: z.array(z.object({ status: z.number() })),
    }),
  ),
});
try {
  const prepared = await prepareArtifact({ ...download, flows: helpers }, web.operations);
  for (const status of [301, 302, 303, 307, 308]) {
    const outcome = await prepared.run({ url: base + '/status/' + status });
    assert.equal(outcome.status, 'completed');
    const result = resultSchema.parse(outcome.value);
    assert.equal(result.page.status, 200);
    assert.deepEqual(
      result.redirects.map((hop) => hop.status),
      [status],
    );
    assert.deepEqual(
      result.files[0]?.redirects.map((hop) => hop.status),
      [302],
    );
    assert.deepEqual(Buffer.from(result.files[0]?.source.body.base64 ?? '', 'base64'), pdf);
  }
  const chain = resultSchema.parse((await prepared.run({ url: base + '/chain' })).value);
  assert.deepEqual(
    chain.redirects.map((hop) => hop.status),
    [301, 307],
  );
  const checks = [
    ['/missing-location', 'redirect-location'],
    ['/hops/4', 'redirect-budget'],
    ['/absent', 'response-status-accepted'],
  ] as const;
  for (const [path, check] of checks) {
    const outcome = await prepared.run({ url: base + path });
    assert.equal(outcome.status, 'failed');
    assert(outcome.error?.message.includes(check));
  }
  await assert.rejects(prepared.run({ url: base + '/loop' }), z.ZodError);
  console.log(
    'Redirect contract: five exact statuses, mixed page/resource chains, bytes, missing location, loop and rejected terminal status passed. No models.',
  );
} finally {
  web.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
