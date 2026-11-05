import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  buildFormSubmission,
  buildVisionRequest,
  imageChoiceProfile,
  readImageChallenge,
  readVisionResponse,
  selectImageChoices,
  type PreparedImages,
} from '../src/search/image-choice/index.js';

const check = (name: string, run: () => void): void => {
  run();
  console.log('[pass] image-choice primitives: ' + name);
};
const fixture = (instruction = 'Select the matching pictures:'): string =>
  `<form id="challenge-form" method="POST" action="https://duckduckgo.com/answer"><div class="anomaly-modal__instructions">${instruction}</div><input type="hidden" name="proof" value="original"><div class="anomaly-modal__box"><input type="checkbox" name="first"><img class="anomaly-modal__image" src="/one.jpg"></div><div class="anomaly-modal__box"><input type="checkbox" name="second" value="yes"><img class="anomaly-modal__image" src="/two.jpg"></div><button name="challenge-submit" value="send">Submit</button></form>`;
const url = 'https://html.duckduckgo.com/html/?q=example';
const challenge = readImageChallenge(fixture(), url, imageChoiceProfile);
assert(challenge);
const images: PreparedImages = {
  tile0: { format: 'png', data_base64: Buffer.from('first').toString('base64') },
  tile1: { format: 'png', data_base64: Buffer.from('second').toString('base64') },
};
const response = {
  model: 'offline-test',
  answers: { tile0: { type: 'noul', noul: 0.4 }, tile1: { type: 'noul', noul: 0.9 } },
  usage: { input_tokens: 1, output_tokens: 1 },
};

check('ordinary pages have no image challenge', () => {
  assert.equal(readImageChallenge('<h1>Search results</h1>', url, imageChoiceProfile), null);
});

check('variable choice counts preserve checkbox, hidden and submit values', () => {
  assert.equal(challenge.tiles.length, 2);
  assert.deepEqual(
    challenge.tiles.map((tile) => tile.value),
    ['on', 'yes'],
  );
  assert.deepEqual(challenge.hidden, [{ name: 'proof', value: 'original' }]);
  assert.deepEqual(challenge.submit, { name: 'challenge-submit', value: 'send' });
  assert.equal(challenge.tiles[0]?.url, 'https://html.duckduckgo.com/one.jpg');
  for (const [html, expected] of [
    [
      fixture().replace(
        '<div class="anomaly-modal__box"><input type="checkbox" name="second" value="yes"><img class="anomaly-modal__image" src="/two.jpg"></div>',
        '',
      ),
      1,
    ],
    [
      fixture().replace(
        '<button',
        '<div class="anomaly-modal__box"><input type="checkbox" name="third"><img class="anomaly-modal__image" src="/three.jpg"></div><button',
      ),
      3,
    ],
  ] satisfies [string, number][]) {
    assert.equal(readImageChallenge(html, url, imageChoiceProfile)?.tiles.length, expected);
  }
});

check('malformed or ambiguous forms fail during recognition', () => {
  for (const html of [
    fixture() + fixture(),
    fixture().replace('method="POST"', 'method="GET"'),
    fixture().replace('action="https://duckduckgo.com/answer"', ''),
    fixture().replace('name="second"', 'name="first"'),
    fixture().replace('<img class="anomaly-modal__image" src="/two.jpg">', ''),
  ]) {
    assert.throws(() => readImageChallenge(html, url, imageChoiceProfile));
  }
});

check('configured origins bound form actions and image URLs', () => {
  for (const html of [
    fixture().replace('https://duckduckgo.com/answer', 'https://other.invalid/'),
    fixture().replace('/one.jpg', 'https://other.invalid/image.png'),
  ]) {
    assert.throws(() => readImageChallenge(html, url, imageChoiceProfile));
  }
});

check('document instructions and single asset references reach the vision request', () => {
  const alternate = readImageChallenge(
    fixture('Select pictures containing bicycles:'),
    url,
    imageChoiceProfile,
  );
  assert(alternate);
  const request = buildVisionRequest(alternate, images, imageChoiceProfile.jev);
  const parsed = z
    .object({
      state: z.object({ instruction: z.string(), tiles: z.record(z.string(), z.string()) }),
      assets: z.record(z.string(), z.json()),
      questions: z.record(z.string(), z.json()),
    })
    .parse(request);
  assert.equal(parsed.state.instruction, alternate.instruction);
  assert.equal(Object.keys(parsed.assets).length, 2);
  for (const reference of Object.values(parsed.state.tiles)) {
    assert.equal(JSON.stringify(parsed.state).split(reference).length - 1, 1);
    assert(Object.hasOwn(parsed.assets, reference));
    assert(!JSON.stringify(parsed.questions).includes(reference));
  }
  assert.equal(Object.keys(parsed.questions).length, 2);
});

check('missing, extra and unsupported image inputs fail before a vision request', () => {
  assert.throws(() => buildVisionRequest(challenge, {}, imageChoiceProfile.jev));
  const first = images.tile0;
  assert(first);
  assert.throws(() =>
    buildVisionRequest(challenge, { ...images, extra: first }, imageChoiceProfile.jev),
  );
  assert.throws(() =>
    Reflect.apply(buildVisionRequest, undefined, [
      challenge,
      { ...images, tile0: { format: 'gif', data_base64: 'x' } },
      imageChoiceProfile.jev,
    ]),
  );
});

check('partial, unknown and invalid vision decisions cannot select tiles', () => {
  for (const invalid of [
    { ...response, answers: { tile0: response.answers.tile0 } },
    { ...response, answers: { ...response.answers, extra: response.answers.tile0 } },
    { ...response, answers: { ...response.answers, tile0: { type: 'noul', noul: 2 } } },
  ]) {
    assert.throws(() => readVisionResponse(invalid, challenge));
    assert.throws(() => selectImageChoices(challenge, invalid, imageChoiceProfile.jev));
  }
});

check('JSON thresholds change selection while submitted fields remain source-owned', () => {
  const selected = selectImageChoices(challenge, response, imageChoiceProfile.jev);
  assert.deepEqual(
    selected.map((tile) => tile.id),
    ['tile1'],
  );
  assert.deepEqual(
    selectImageChoices(challenge, response, { ...imageChoiceProfile.jev, threshold: 0.3 }).map(
      (tile) => tile.id,
    ),
    ['tile0', 'tile1'],
  );
  const tile = selected[0];
  assert(tile);
  const submission = buildFormSubmission(challenge, [
    { ...tile, name: 'invented', value: 'invented' },
  ]);
  assert.equal(submission.url, challenge.action);
  assert.equal(submission.method, 'POST');
  assert.deepEqual(submission.fields, [
    { name: 'proof', value: 'original' },
    { name: 'second', value: 'yes' },
    { name: 'challenge-submit', value: 'send' },
  ]);
  assert.throws(() => buildFormSubmission(challenge, [{ ...tile, id: 'unknown' }]));
  assert.throws(() => buildFormSubmission(challenge, [...selected, ...selected]));
});
