import assert from 'node:assert/strict';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { discoveryProfile } from '../src/discovery/index.js';
import { blueprint } from '../src/discovery/blueprint.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody } from '../src/operations/http-source.js';
const navigationSchema = z
  .object({
    matchedElements: z.number().int().nonnegative(),
    collectedUrls: z.number().int().nonnegative(),
    collectionLimit: z.number().int().positive(),
    collectionAtLimit: z.boolean(),
  })
  .strict();
const selection = blueprint.flows.find((flow) => flow.id === 'select');
assert(selection);
const web = createWebOperations();
try {
  const select = await prepareArtifact(
    {
      stamp: blueprint.stamp,
      data: { formats: discoveryProfile.formats },
      flow: selection.flow,
      flows: blueprint.flows,
    },
    web.operations,
    discoveryProfile.engine,
  );
  const links = '<a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a>';
  const duplicateLinks = '<a href="/one">One</a>'.repeat(3);
  const cases = [
    {
      name: 'more links than collection slots',
      html: links,
      limit: 2,
      seen: [],
      canFollow: true,
      selector: 'main a',
      expected: {
        matchedElements: 3,
        collectedUrls: 2,
        collectionLimit: 2,
        collectionAtLimit: true,
      },
    },
    {
      name: 'exactly the limit is not proof of omitted destinations',
      html: '<a href="/one">One</a><a href="/two">Two</a>',
      limit: 2,
      seen: [],
      canFollow: true,
      selector: 'main a',
      expected: {
        matchedElements: 2,
        collectedUrls: 2,
        collectionLimit: 2,
        collectionAtLimit: true,
      },
    },
    {
      name: 'duplicate references reduce URL count below the limit',
      html: duplicateLinks,
      limit: 4,
      seen: [],
      canFollow: true,
      selector: 'main a',
      expected: {
        matchedElements: 3,
        collectedUrls: 1,
        collectionLimit: 4,
        collectionAtLimit: false,
      },
    },
    {
      name: 'duplicates can reach the limit without omitting a distinct destination',
      html: duplicateLinks,
      limit: 1,
      seen: [],
      canFollow: true,
      selector: 'main a',
      expected: {
        matchedElements: 3,
        collectedUrls: 1,
        collectionLimit: 1,
        collectionAtLimit: true,
      },
    },
    {
      name: 'seen references are excluded before applying the limit',
      html: links,
      limit: 4,
      seen: ['https://example.test/one', 'https://example.test/two'],
      canFollow: true,
      selector: 'main a',
      expected: {
        matchedElements: 3,
        collectedUrls: 1,
        collectionLimit: 4,
        collectionAtLimit: false,
      },
    },
    {
      name: 'zero selector matches stay observable',
      html: links,
      limit: 4,
      seen: [],
      canFollow: true,
      selector: 'main .missing',
      expected: {
        matchedElements: 0,
        collectedUrls: 0,
        collectionLimit: 4,
        collectionAtLimit: false,
      },
    },
    {
      name: 'disabled navigation does not invent match counts',
      html: links,
      limit: 4,
      seen: [],
      canFollow: false,
      selector: 'main a',
      expected: null,
    },
    {
      name: 'result-only rules do not invent navigation evidence',
      html: links,
      limit: 4,
      seen: [],
      canFollow: true,
      selector: null,
      expected: null,
    },
  ];
  for (const item of cases) {
    const body = captureBody(Buffer.from('<main>' + item.html + '</main>'));
    const source = {
      url: 'https://example.test/root',
      status: 200,
      headers: { 'content-type': ['text/html'] },
      body,
      encoded: body,
    };
    const original = JSON.stringify(source);
    const rules = { preconditions: [], selector: 'main', links: item.selector, result: null };
    const policy = {
      ...discoveryProfile.traversal,
      allowLinkFollowing: true,
      maxPages: item.limit,
    };
    const trial = await select.run({
      source,
      rule: rules,
      policy,
      canFollow: item.canFollow,
      seen: item.seen,
      minimumResultMatches: 0,
    });
    assert.equal(trial.status, 'completed', item.name);
    const value = z
      .object({ navigation: navigationSchema.nullable(), urls: z.array(z.string()) })
      .parse(trial.value);
    assert.deepEqual(value.navigation, item.expected, item.name);
    assert.equal(JSON.stringify(source), original);
  }
  console.log(
    `Trial navigation context: ${cases.length} mechanical navigation controls passed; no model calls or inferred completeness.`,
  );
} finally {
  web.close();
}
