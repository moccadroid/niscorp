import assert from 'node:assert/strict';
import { Image } from 'imagescript';
import type { Signal } from '@niscorp/signal';
import { duckduckgo } from '../src/search/duckduckgo.js';
import { ChallengeError, solveImageChallenge } from '../src/search/image-challenge.js';
import type { WebTransport } from '../src/web/transport.js';
import { captureBody, type HttpSource } from '../src/web/source.js';

const settings = duckduckgo.challenge?.settings ?? assert.fail('duckduckgo declares its challenge');
const source = (
  url: string,
  bytes: Uint8Array | string,
  status = 200,
  headers: Record<string, string[]> = {},
): HttpSource => {
  const body = captureBody(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
  return {
    url,
    status,
    headers: { 'content-type': ['text/html; charset=utf-8'], ...headers },
    encoded: body,
    body,
  };
};
const png = await new Image(8, 8).fill(0xff0000ff).encode();
const challengePage = source(
  'https://html.duckduckgo.com/html/?q=x',
  `<form id="challenge-form" method="POST" action="https://duckduckgo.com/anomaly.js?cc=1">
    <div class="anomaly-modal__instructions">Select all squares containing a duck</div>
    <input type="hidden" name="token" value="t1">
    <div class="anomaly-modal__box"><img class="anomaly-modal__image" src="https://html.duckduckgo.com/i/a.png"><input type="checkbox" name="image-check_a"></div>
    <div class="anomaly-modal__box"><img class="anomaly-modal__image" src="https://html.duckduckgo.com/i/b.png"><input type="checkbox" name="image-check_b"></div>
    <button name="challenge-submit" value="submit">Submit</button>
  </form>`,
  202,
);
const posts: { url: string; headers: Record<string, string>; body: string }[] = [];
const web: WebTransport = {
  get: async (url) => {
    if (url.endsWith('.png')) return source(url, png, 200, { 'content-type': ['image/png'] });
    if (url === 'https://html.duckduckgo.com/html/?q=x&done=1')
      return source(url, '<div class="result">results</div>');
    return assert.fail(`unexpected GET ${url}`);
  },
  post: async (url, headers, body) => {
    posts.push({ url, headers, body });
    if (posts.length === 1)
      return source(
        url,
        '<form id="success-form" method="POST" action="https://duckduckgo.com/resume"><input name="r" value="ok"></form>',
      );
    return source(url, '', 302, { location: ['https://html.duckduckgo.com/html/?q=x&done=1'] });
  },
  close: () => {},
};
const asked: {
  state: unknown;
  questions: Record<string, { instructions: string }>;
  images: Record<string, unknown>;
}[] = [];
const jev = {
  decide: async (request: {
    state: unknown;
    questions: Record<string, { instructions: string }>;
    images: Record<string, unknown>;
  }) => {
    asked.push(request);
    return {
      calibrated: false,
      decisions: { tile0: { answer: true }, tile1: { answer: false } },
      meta: { model: 'jev', usage: { inputTokens: 10, outputTokens: 2 }, durationMs: 1 },
    };
  },
} as unknown as Signal;

const page = await solveImageChallenge({
  page: challengePage,
  settings,
  web,
  jev,
  signal: AbortSignal.timeout(20_000),
});
assert.equal(page.url, 'https://html.duckduckgo.com/html/?q=x&done=1');

// Jev sees the same state and questions as today's request; images go by uuid.
const request = asked[0] ?? assert.fail('Jev was asked');
const tiles = (request.state as { instruction: string; tiles: Record<string, string> }).tiles;
assert.equal(
  (request.state as { instruction: string }).instruction,
  'Select all squares containing a duck',
);
assert.deepEqual(Object.keys(tiles), ['tile0', 'tile1']);
assert.deepEqual(Object.keys(request.images).sort(), Object.values(tiles).sort());
assert.equal(
  request.questions.tile0?.instructions,
  'Does the picture in `tiles.tile0` contain the object requested by the challenge instruction?',
);

// The chosen tile only, with the hidden fields and the submit button; then the success form; the recorded headers.
assert.deepEqual(
  posts.map((p) => [p.url, p.body]),
  [
    ['https://duckduckgo.com/anomaly.js?cc=1', 'token=t1&image-check_a=on&challenge-submit=submit'],
    ['https://duckduckgo.com/resume', 'r=ok'],
  ],
);
assert.deepEqual(posts[0]?.headers, {
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept-Encoding': 'identity',
  Origin: 'https://html.duckduckgo.com',
  Referer: 'https://html.duckduckgo.com/html/?q=x',
});

// A tile outside the allowed image origins is refused before anything is fetched.
const foreign = source(
  challengePage.url,
  readHtml(challengePage).replace('https://html.duckduckgo.com/i/a.png', 'https://evil.test/a.png'),
  202,
);
await assert.rejects(
  solveImageChallenge({ page: foreign, settings, web, jev, signal: AbortSignal.timeout(20_000) }),
  (e: unknown) => e instanceof ChallengeError,
);

function readHtml(s: HttpSource) {
  return Buffer.from(s.body.base64, 'base64').toString('utf8');
}

console.log('image challenge: tiles, one Jev request, form posts, continuation redirect, origins');
