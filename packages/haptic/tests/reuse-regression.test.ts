import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import fixture from './fixtures/reuse/cases.json' with { type: 'json' };
import { captureBody } from '../src/operations/http-source.js';
import { createWebOperations } from '../src/operations/index.js';

const bytes = await readFile(new URL('./fixtures/reuse/7zip.html', import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.provenance.sourceSha256);
const html = bytes.toString('utf8');
const changed = fixture.changes.reduce((text, [before, after]) => {
  assert(before && after);
  assert(text.includes(before));
  return text.replaceAll(before, after);
}, html);
const source = (text: string) => ({
  url: fixture.url,
  status: 200,
  headers: {},
  body: captureBody(Buffer.from(text)),
  encoded: captureBody(Buffer.from(text)),
});
const selected = z.object({
  items: z.array(
    z.object({ path: z.array(z.number().int()), attributes: z.record(z.string(), z.string()) }),
  ),
});
const web = createWebOperations();
const signal = new AbortController().signal;
try {
  for (const example of fixture.cases) {
    const outputs = [];
    for (const document of [source(html), source(changed)]) {
      const actual = selected.parse(
        await web.operations['html.select']?.run(
          { source: document, selector: example.rules.selector },
          { signal },
        ),
      );
      const expected = selected.parse(
        await web.operations['html.select']?.run(
          { source: document, selector: example.reference },
          { signal },
        ),
      );
      outputs.push({
        actual: actual.items.map((item) => item.attributes.href),
        expected: expected.items.map((item) => item.attributes.href),
      });
    }
    assert.equal(outputs[0]?.expected.length, example.expectedOriginal);
    assert.equal(outputs[1]?.expected.length, example.expectedChanged);
    const current = outputs[0];
    const future = outputs[1];
    assert(current && future);
    assert.deepEqual(
      current.actual,
      current.expected,
      'All four rules are correct on the original page',
    );
    assert.equal(
      JSON.stringify(future.actual) === JSON.stringify(future.expected),
      example.expectedVariantMatch,
      example.id,
    );
  }
} finally {
  web.close();
}
console.log(
  'Reuse regression: 4 independent current/fixed-value cases, unchanged captured rules and original source integrity passed. No models.',
);
