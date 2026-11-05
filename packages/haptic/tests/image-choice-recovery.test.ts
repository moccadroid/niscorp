import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { z } from 'zod';
import { Image } from 'imagescript';
import { createImageScriptPreparer } from '../src/search/image-choice/imagescript.js';
import { createWebOperations } from '../src/operations/index.js';
import { captureBody, HttpSourceSchema } from '../src/operations/http-source.js';
import { discoveryProfile } from '../src/discovery/index.js';
import {
  createImageChallengeRecovery,
  imageChoiceProfile,
  type ImageChoiceAdapters,
} from '../src/search/image-choice/index.js';

const source = (url: string, text: string, status = 200): z.infer<typeof HttpSourceSchema> => {
  const body = captureBody(Buffer.from(text));
  return { url, status, headers: { 'content-type': ['text/html'] }, encoded: body, body };
};
const requests: string[] = [];
const imageBytes = await new Image(4, 3).fill(0x008000ff).encodeJPEG();
const prepareImages = createImageScriptPreparer();
const server = createServer((request, response) => {
  requests.push(request.url ?? '');
  response.setHeader(
    'content-type',
    request.url?.startsWith('/image') ? 'image/jpeg' : 'text/html',
  );
  response.end(
    request.url?.startsWith('/image')
      ? imageBytes
      : '<a class="result__a" href="/destination">Actual result</a>',
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const challenge = source(
  origin + '/search?q=unaltered',
  `<form id="challenge-form" method="POST" action="/answer?proof=original">
  <p class="anomaly-modal__instructions">Select pictures containing bicycles</p><input type="hidden" name="token" value="source-token">
  <div class="anomaly-modal__box"><input type="checkbox" name="first"><img class="anomaly-modal__image" src="/image-a"></div>
  <div class="anomaly-modal__box"><input type="checkbox" name="second" value="yes"><img class="anomaly-modal__image" src="/image-b"></div>
  <button name="challenge-submit" value="source-button">Submit</button></form>`,
  202,
);
const web = createWebOperations();
const profile = {
  ...imageChoiceProfile,
  allowedFormOrigins: [origin],
  allowedImageOrigins: [origin],
  continuation: { ...imageChoiceProfile.continuation, allowedOrigins: [origin] },
};
let visions = 0,
  posts = 0,
  preparation = 0,
  mode = 'good';
const vision = {
  model: 'offline',
  answers: { tile0: { type: 'noul', noul: 0.1 }, tile1: { type: 'noul', noul: 0.9 } },
  usage: { input_tokens: 1, output_tokens: 1 },
};
const adapters: ImageChoiceAdapters = {
  operations: web.operations,
  limits: discoveryProfile.engine,
  profile,
  async prepareImages(observed, images, signal) {
    preparation++;
    signal.throwIfAborted();
    assert.equal(images.length, 2);
    assert(images.every((image, index) => image.url === observed.tiles[index]?.url));
    return prepareImages(observed, images, signal);
  },
  async decideImages(request, _policy, signal) {
    visions++;
    signal.throwIfAborted();
    assert.equal(
      z.object({ instruction: z.string() }).parse(request.state).instruction,
      'Select pictures containing bicycles',
    );
    return mode === 'incomplete' ? { ...vision, answers: { tile0: vision.answers.tile0 } } : vision;
  },
  async postForm(form, _policy, signal) {
    posts++;
    signal.throwIfAborted();
    assert(Object.isFrozen(form));
    assert(Object.isFrozen(form.fields));
    if (form.url.includes('/answer')) {
      assert.equal(form.referer, challenge.url);
      assert.deepEqual(form.fields, [
        { name: 'token', value: 'source-token' },
        { name: 'second', value: 'yes' },
        { name: 'challenge-submit', value: 'source-button' },
      ]);
      return source(
        form.url,
        mode === 'rejected'
          ? '<p>Rejected</p>'
          : '<form id="success-form" method="POST" action="/resume"><input name="q" value="unaltered"></form>',
      );
    }
    assert.deepEqual(form.fields, [{ name: 'q', value: 'unaltered' }]);
    return {
      ...source(form.url, '', 302),
      headers: {
        location: [mode === 'foreign' ? 'https://unapproved.invalid/' : '/results?q=unaltered'],
      },
    };
  },
};
try {
  const recovery = await createImageChallengeRecovery(adapters);
  const context = { signal: new AbortController().signal };
  const result = HttpSourceSchema.parse(await recovery.run(challenge, context));
  assert.equal(result.status, 200);
  assert.equal(result.url, origin + '/results?q=unaltered');
  assert.equal(visions, 1);
  assert.equal(posts, 2);
  assert.equal(preparation, 1);
  console.log(
    '[pass] image recovery: JSON flow downloads images, calls vision once, preserves both source forms and follows actual HTTP redirect',
  );

  const before = { visions, posts, requests: requests.length };
  await assert.rejects(
    recovery.run(source(challenge.url, '<h1>Ordinary page</h1>'), context),
    /configured image-choice/,
  );
  assert.deepEqual({ visions, posts, requests: requests.length }, before);
  await assert.rejects(
    recovery.run(
      {
        ...challenge,
        body: captureBody(
          Buffer.from(
            Buffer.from(challenge.body.base64, 'base64')
              .toString()
              .replace('/image-a', 'https://unapproved.invalid/image'),
          ),
        ),
      },
      context,
    ),
    /outside configured origins/,
  );
  assert.equal(visions, before.visions);
  console.log(
    '[pass] image recovery: ordinary/unsupported pages and unapproved image origins make no vision or image request',
  );

  mode = 'incomplete';
  const beforeIncompletePosts = posts;
  await assert.rejects(recovery.run(challenge, context), /answer each challenge tile/);
  assert.equal(posts, beforeIncompletePosts);
  mode = 'rejected';
  const beforeRejectedPosts = posts;
  await assert.rejects(recovery.run(challenge, context), /No observed success POST form/);
  assert.equal(posts, beforeRejectedPosts + 1);
  console.log(
    '[pass] image recovery: incomplete vision cannot submit; rejected CAPTCHA cannot continue',
  );

  mode = 'foreign';
  await assert.rejects(recovery.run(challenge, context), /outside configured origins/);
  assert(!requests.some((url) => url.includes('unapproved')));
  const aborted = new AbortController();
  aborted.abort(new Error('cancelled-check'));
  const beforeAbort = visions;
  await assert.rejects(recovery.run(challenge, { signal: aborted.signal }), /cancelled-check/);
  assert.equal(visions, beforeAbort);
  console.log(
    '[pass] image recovery: continuation origins and caller cancellation remain enforced',
  );

  const legacySource = (
    url: string,
    html: string,
    status = 200,
  ): z.infer<typeof HttpSourceSchema> => {
    const body = captureBody(Buffer.from(html, 'latin1'));
    return {
      url,
      status,
      headers: { 'content-type': ['text/html; charset=windows-1252'] },
      encoded: body,
      body,
    };
  };
  const legacy = await createImageChallengeRecovery({
    ...adapters,
    async decideImages(request) {
      assert.equal(
        z.object({ instruction: z.string() }).parse(request.state).instruction,
        'Select pictures containing vélo',
      );
      return vision;
    },
    async postForm(form) {
      assert(Object.isFrozen(form));
      if (form.url.includes('/answer')) {
        assert.equal(form.fields[0]?.value, 'café');
        return legacySource(
          form.url,
          '<form id="success-form" method="POST" action="/resume"><input name="q" value="café"></form>',
        );
      }
      assert.deepEqual(form.fields, [{ name: 'q', value: 'café' }]);
      return source(form.url, '<div class="no-results">No results found</div>');
    },
  });
  const legacyChallenge = legacySource(
    challenge.url,
    Buffer.from(challenge.body.base64, 'base64')
      .toString()
      .replace('bicycles', 'vélo')
      .replace('source-token', 'café'),
    202,
  );
  const empty = HttpSourceSchema.parse(await legacy.run(legacyChallenge, context));
  assert.equal(empty.status, 200);
  assert(Buffer.from(empty.body.base64, 'base64').toString().includes('no-results'));
  console.log(
    '[pass] image recovery: transport charset preserves challenge/success-form text; recovered empty pages reach the existing search admission',
  );
} finally {
  web.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
