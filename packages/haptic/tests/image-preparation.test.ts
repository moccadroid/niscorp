import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Image, Animation, Frame } from 'imagescript';
import { captureBody } from '../src/operations/http-source.js';
import {
  createImageScriptPreparer,
  imageScriptProfile,
} from '../src/search/image-choice/imagescript.js';
import type { ImageChallenge } from '../src/search/image-choice/index.js';

const image = await new Image(3, 2).fill(0xc8280aff).encode();
const body = captureBody(image);
const source = { url: 'https://images.invalid/a', status: 200, headers: {}, encoded: body, body };
const challenge: ImageChallenge = {
  pageUrl: 'https://page.invalid/',
  action: 'https://page.invalid/answer',
  instruction: 'Any object',
  hidden: [],
  submit: { name: 'submit', value: 'yes' },
  scripts: 0,
  tiles: [{ id: 'original-id', name: 'pick', value: 'yes', url: source.url, file: 'unused.jpg' }],
};
const policy = { ...imageScriptProfile, minimumWidth: 8, minimumHeight: 7 };
const prepare = createImageScriptPreparer(policy);
policy.minimumWidth = 100;
const signal = new AbortController().signal;
const before = structuredClone({ challenge, source });
const prepared = await prepare(challenge, [source], signal);
assert.deepEqual({ challenge, source }, before);
assert.deepEqual(Object.keys(prepared), ['original-id']);
const asset = prepared['original-id'];
assert(asset);
const decoded = await Image.decode(Buffer.from(asset.data_base64, 'base64'));
const data = Buffer.from(decoded.bitmap);
const info = { width: decoded.width, height: decoded.height };
assert.deepEqual([info.width, info.height], [8, 7]);
const pixel = (x: number, y: number): number[] => [
  ...data.subarray((y * info.width + x) * 4, (y * info.width + x + 1) * 4),
];
assert.deepEqual(pixel(0, 0), [255, 255, 255, 255]);
for (let y = 2; y < 4; y++)
  for (let x = 2; x < 5; x++) assert.deepEqual(pixel(x, y), [200, 40, 10, 255]);
assert.deepEqual(pixel(5, 4), [255, 255, 255, 255]);
assert.deepEqual(
  await prepare(challenge, [source], signal),
  prepared,
  'PNG output must be deterministic',
);
const transparent = new Image(2, 1);
transparent.bitmap.set([10, 20, 30, 0, 40, 50, 60, 128]);
const transparentBody = captureBody(await transparent.encode());
const transparentResult = await prepare(
  challenge,
  [{ ...source, body: transparentBody, encoded: transparentBody }],
  signal,
);
const transparentAsset = transparentResult['original-id'];
assert(transparentAsset);
const transparentOutput = await Image.decode(Buffer.from(transparentAsset.data_base64, 'base64'));
const transparentSource = await Image.decode(Buffer.from(transparentBody.base64, 'base64'));
const targetOffset = (3 * transparentOutput.width + 3) * 4;
assert.deepEqual(
  [...transparentOutput.bitmap.subarray(targetOffset, targetOffset + 8)],
  [...transparentSource.bitmap],
);
console.log(
  '[pass] image preparation: exact source pixels and tile IDs retained, centered padding, owned JSON policy and immutable input',
);

const jpeg = await new Image(12, 9).fill(0x0000ffff).encodeJPEG();
const jpegBody = captureBody(jpeg);
const larger = await prepare(challenge, [{ ...source, body: jpegBody, encoded: jpegBody }], signal);
const largerAsset = larger['original-id'];
assert(largerAsset);
const dimensions = await Image.decode(Buffer.from(largerAsset.data_base64, 'base64'));
assert.deepEqual([dimensions.width, dimensions.height], [12, 9]);
console.log('[pass] image preparation: JPEG converted to PNG, larger images never resized');

await assert.rejects(prepare(challenge, [], signal), /IDENTITY/);
await assert.rejects(
  prepare(
    { ...challenge, tiles: [...challenge.tiles, ...challenge.tiles] },
    [source, source],
    signal,
  ),
  /IDENTITY/,
);
await assert.rejects(
  prepare(challenge, [{ ...source, url: 'https://wrong.invalid/' }], signal),
  /SOURCE/,
);
await assert.rejects(prepare(challenge, [{ ...source, status: 404 }], signal), /SOURCE/);
await assert.rejects(
  prepare(challenge, [{ ...source, body: { ...body, sha256: 'wrong' } }], signal),
  /bytes and hash/,
);
const bad = captureBody(Buffer.from('not an image'));
await assert.rejects(
  prepare(challenge, [{ ...source, body: bad, encoded: bad }], signal),
  /UNSUPPORTED_FORMAT/,
);
const animated = await new Animation([
  new Frame(1, 1).fill(0xff0000ff),
  new Frame(1, 1).fill(0x0000ffff),
]).encodeGIF();
const animatedBody = captureBody(animated);
assert.equal((await Animation.decode(animated)).frames.length, 2);
await assert.rejects(
  prepare(challenge, [{ ...source, body: animatedBody, encoded: animatedBody }], signal),
  /UNSUPPORTED_FORMAT/,
);
const apng = await new Animation([
  new Frame(1, 1).fill(0xff0000ff),
  new Frame(1, 1).fill(0x0000ffff),
]).encodeAPNG();
const apngBody = captureBody(apng);
await assert.rejects(
  prepare(challenge, [{ ...source, body: apngBody, encoded: apngBody }], signal),
  /one complete image per tile/,
);
const tiff = captureBody(Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]));
await assert.rejects(
  prepare(challenge, [{ ...source, body: tiff, encoded: tiff }], signal),
  /UNSUPPORTED_FORMAT/,
);
await assert.rejects(
  createImageScriptPreparer({ ...imageScriptProfile, maxInputBytes: 1 })(
    challenge,
    [source],
    signal,
  ),
  /INPUT_BYTES/,
);
await assert.rejects(
  createImageScriptPreparer({ ...imageScriptProfile, maxInputPixels: 1 })(
    challenge,
    [source],
    signal,
  ),
  /too large|pixel limit/i,
);
await assert.rejects(
  createImageScriptPreparer({ ...imageScriptProfile, maxOutputPixels: 1 })(
    challenge,
    [source],
    signal,
  ),
  /OUTPUT_PIXELS/,
);
await assert.rejects(
  createImageScriptPreparer({ ...imageScriptProfile, maxOutputBytes: 1 })(
    challenge,
    [source],
    signal,
  ),
  /OUTPUT_BYTES/,
);
const controller = new AbortController();
const pending = prepare(challenge, [source], controller.signal);
controller.abort(new Error('cancel-image-preparation'));
await assert.rejects(pending, /cancel-image-preparation/);
await assert.rejects(prepare(challenge, [source], controller.signal), /cancel-image-preparation/);
console.log(
  '[pass] image preparation: identity, status, integrity, malformed image, byte/pixel limits and cancellation enforced',
);

const probe = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `
  import { register } from 'node:module';
  register('data:text/javascript,' + encodeURIComponent(
    'export function resolve(s,c,n){if(s==="imagescript")throw new Error("CODEC_UNAVAILABLE");return n(s,c)}'
  ), import.meta.url);
  await import('./dist/index.js');
  await import('./dist/search/index.js');
  await import('./dist/search/image-choice/index.js');
  try { await import('./dist/search/image-choice/imagescript.js'); throw new Error('Expected missing codec'); }
  catch (error) { if (error.message !== 'CODEC_UNAVAILABLE') throw error; }
`,
  ],
  { encoding: 'utf8', windowsHide: true },
);
assert.equal(probe.status, 0, probe.stderr);
console.log(
  '[pass] image preparation: core and recovery import without codec; only optional ImageScript entry requires it',
);
