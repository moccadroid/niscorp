import assert from 'node:assert/strict';
import { duckduckgo } from '../src/search/duckduckgo.js';
import { buildFormSubmission } from '../src/search/image-choice/choices.js';
import { readImageChallenge } from '../src/search/image-choice/reader.js';

const imageChoiceProfile =
  duckduckgo.challenge?.settings ?? assert.fail('duckduckgo declares its challenge');
const check = (name: string, run: () => void): void => {
  run();
  console.log('[pass] image-choice primitives: ' + name);
};
const fixture = (instruction = 'Select the matching pictures:'): string =>
  `<form id="challenge-form" method="POST" action="https://duckduckgo.com/answer"><div class="anomaly-modal__instructions">${instruction}</div><input type="hidden" name="proof" value="original"><div class="anomaly-modal__box"><input type="checkbox" name="first"><img class="anomaly-modal__image" src="/one.jpg"></div><div class="anomaly-modal__box"><input type="checkbox" name="second" value="yes"><img class="anomaly-modal__image" src="/two.jpg"></div><button name="challenge-submit" value="send">Submit</button></form>`;
const url = 'https://html.duckduckgo.com/html/?q=example';
const challenge = readImageChallenge(fixture(), url, imageChoiceProfile);
assert(challenge);
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

check('submitted fields remain source-owned', () => {
  const selected = challenge.tiles.filter((tile) => tile.id === 'tile1');
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
