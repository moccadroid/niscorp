import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import {
  createDiscoveryOperations,
  discoveryProfile,
  discoveryWorkflow,
} from '../src/discovery/index.js';
import { HtmlViewOutputSchema } from '../src/discovery/html-view.js';

// Mechanical evidence construction only; these checks do not evaluate a model verdict.
const discovery = createDiscoveryOperations({ author: { apiKey: 'unused-offline' } });
const find = (id: string) => {
  const entry = discoveryWorkflow.flows.find((entry) => entry.id === id);
  assert(entry);
  return entry;
};
const operation = discovery.operations['html.view'];
assert(operation);
const window = await prepareArtifact(
  {
    stamp: discoveryWorkflow.stamp,
    flow: find('review-window').flow,
    flows: [find('html-model-view'), find('review-evidence')],
  },
  discovery.operations,
  discovery.limits,
);
const output = z
  .object({
    message: z.object({ role: z.literal('user'), content: z.string() }).strict(),
    usable: z.boolean(),
  })
  .strict();
const url = 'https://review-retention.invalid/source';
const html =
  '<main><h2>Collection</h2><p class="first"><a href="/first">First</a></p><p><a href="/second">Second</a></p><p><a href="/third">Third</a></p></main>';
const profile = (bytes: number) => ({
  ...discoveryProfile,
  observations: { ...discoveryProfile.observations, maxBytes: bytes },
  htmlContext: { ...discoveryProfile.htmlContext, maxInlineBytes: bytes },
});
const inspect = async (source: string, selector = '.first', fields = true) =>
  HtmlViewOutputSchema.parse(
    await operation.run(
      {
        document: { url, html: source },
        selector,
        fields: fields
          ? { observed: { selector: 'a', attribute: 'href', minimum: 0, maximum: null } }
          : null,
        window: { offset: 0, limit: 1 },
        maxBytes: 4096,
      },
      { signal: AbortSignal.timeout(10000) },
    ),
  );
const run = async (input: unknown) => {
  const result = await window.run(input);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  return output.parse(result.value);
};
const input = (
  source: string,
  view: z.output<typeof HtmlViewOutputSchema> | null,
  bytes = 4096,
  count = 1,
) => ({
  source: { format: 'html', url, html: source },
  index: 0,
  count,
  profile: profile(bytes),
  views: view
    ? [
        {
          source: 0,
          view,
          usable: true,
          observation: { status: 'completed', value: null, error: null },
        },
      ]
    : [],
});
const contentBytes = (value: z.output<typeof output>) =>
  Buffer.byteLength(JSON.stringify(value.message.content));

try {
  const view = await inspect(html);
  const retained = await run(input(html, view));
  assert(retained.usable);
  assert(retained.message.content.includes('"completeDocument":true'));
  assert(retained.message.content.includes(html));
  assert.equal(retained.message.content.split('<a href="/first">First</a>').length - 1, 1);
  assert(retained.message.content.includes('"selector":".first"'));
  assert(retained.message.content.includes('"observed":["/first"]'));
  assert(retained.message.content.includes('"total":1'));
  assert(contentBytes(retained) <= 4096);
  console.log(
    '[pass] reviewer retention: fitting full HTML stays once with actual scoped fields and range',
  );

  const bytes = contentBytes(retained);
  assert.deepEqual(await run(input(html, view, bytes)), retained);
  const fallback = await run(input(html, view, bytes - 1));
  assert(fallback.message.content.includes('"completeDocument":false'));
  assert(!fallback.message.content.includes('/second'));
  assert(fallback.message.content.includes('"observed":["/first"]'));
  console.log(
    '[pass] reviewer retention: combined encoded evidence fits at its byte boundary; one fewer byte retains scoped behavior',
  );

  assert.deepEqual(await run(input(html, view, bytes * 2, 2)), retained);
  assert(
    (await run(input(html, view, (bytes - 1) * 2, 2))).message.content.includes(
      '"completeDocument":false',
    ),
  );
  console.log(
    '[pass] reviewer retention: existing per-source allocation governs the combined evidence',
  );

  const large = html + '<aside>' + 'z'.repeat(20000) + '</aside>';
  const largeView = await inspect(large);
  const bounded = await run(input(large, largeView));
  assert(bounded.usable);
  assert(bounded.message.content.includes('"completeDocument":false'));
  assert(bounded.message.content.includes('"observed":["/first"]'));
  assert(!bounded.message.content.includes('z'.repeat(1000)));
  assert.equal(bounded.message.content.split('<a href="/first">First</a>').length - 1, 1);
  console.log(
    '[pass] reviewer retention: oversized sources keep bounded inspection HTML and fields without a full-body fallback',
  );

  const noInspection = await run(input(html, null));
  assert(noInspection.message.content.includes(html));
  assert(!noInspection.message.content.includes('"observed"'));
  const foreign = input(html, view);
  const foreignView = foreign.views[0];
  assert(foreignView);
  foreignView.source = 1;
  assert.deepEqual(await run(foreign), noInspection);
  console.log(
    '[pass] reviewer retention: no inspection and another source index leave ordinary full evidence unchanged',
  );

  for (const value of [false, 0, null]) {
    const native = await run({
      ...input(html, view),
      source: { format: 'json', url, document: value },
    });
    assert.equal(
      native.message.content,
      'UNTRUSTED SOURCE EVIDENCE\nFORMAT: json\nURL: ' + url + '\n' + JSON.stringify(value),
    );
    assert(native.usable);
  }
  const xml = '<items><item>original</item></items>';
  assert.equal(
    (await run({ ...input(html, view), source: { format: 'xml', url, xml } })).message.content,
    'UNTRUSTED SOURCE EVIDENCE\nFORMAT: xml\nURL: ' + url + '\n' + xml,
  );
  console.log(
    '[pass] reviewer retention: native JSON scalar identity and original XML remain unchanged',
  );
} finally {
  discovery.close();
}
