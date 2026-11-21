import { load } from 'cheerio';
import { ChallengeSchema, type ImageChallenge, type ImageChoiceProfile } from './contracts.js';
import { OperationFailure } from '../../engine/control.js';
import { decodeHtmlSource, readHtmlProfile } from '../../readers/html/index.js';

// Promoted from the tested research reader; selectors and origins remain profile data.
export const readImageChallenge = (
  html: string | Uint8Array,
  pageUrl: string,
  profile: Pick<
    ImageChoiceProfile,
    | 'form'
    | 'tile'
    | 'checkbox'
    | 'image'
    | 'submit'
    | 'instruction'
    | 'allowedFormOrigins'
    | 'allowedImageOrigins'
  >,
): ImageChallenge | null => {
  const $ = load(
    typeof html === 'string'
      ? html
      : decodeHtmlSource(Buffer.from(html), {}, readHtmlProfile()).html,
  );
  const form = $(profile.form);
  if (form.length === 0) return null;
  if (form.length !== 1 || form.attr('method')?.toUpperCase() !== 'POST')
    throw new OperationFailure('IMAGE_CHALLENGE_FORM', 'Unsupported or ambiguous challenge form');
  const actionValue = form.attr('action');
  if (!actionValue)
    throw new OperationFailure('IMAGE_CHALLENGE_FORM', 'Challenge form action is missing');
  const action = new URL(actionValue, pageUrl).href;
  if (!profile.allowedFormOrigins.includes(new URL(action).origin))
    throw new OperationFailure(
      'IMAGE_CHALLENGE_ORIGIN',
      'Challenge form action is outside configured origins',
    );
  const tiles = form
    .find(profile.tile)
    .toArray()
    .map((node, index) => {
      const checkbox = $(node).find(profile.checkbox),
        image = $(node).find(profile.image);
      const name = checkbox.attr('name'),
        src = image.attr('src');
      if (checkbox.length !== 1 || image.length !== 1 || !name || !src)
        throw new OperationFailure(
          'IMAGE_CHALLENGE_FORM',
          'Each image choice must have one named checkbox and one image URL',
        );
      const url = new URL(src, pageUrl);
      if (!profile.allowedImageOrigins.includes(url.origin))
        throw new OperationFailure(
          'IMAGE_CHALLENGE_ORIGIN',
          'Challenge image is outside configured origins',
        );
      return {
        id: 'tile' + index,
        name,
        value: checkbox.attr('value') ?? 'on',
        url: url.href,
        file: 'tile' + index + '.jpg',
      };
    });
  if (new Set(tiles.map((tile) => tile.name)).size !== tiles.length)
    throw new OperationFailure(
      'IMAGE_CHALLENGE_FORM',
      'Image choices must have distinct field names',
    );
  const submit = form.find(profile.submit),
    submitName = submit.attr('name');
  if (submit.length !== 1 || !submitName)
    throw new OperationFailure('IMAGE_CHALLENGE_FORM', 'One named submit control is required');
  return ChallengeSchema.parse({
    pageUrl,
    action,
    instruction: form.find(profile.instruction).text().trim(),
    tiles,
    hidden: form
      .find('input[type=hidden][name]')
      .toArray()
      .map((node) => ({
        name: $(node).attr('name'),
        value: $(node).attr('value') ?? '',
      })),
    submit: { name: submitName, value: submit.attr('value') ?? '' },
    scripts: $('script').length,
  });
};
