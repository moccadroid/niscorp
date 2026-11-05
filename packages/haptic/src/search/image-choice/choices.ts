import { randomUUID } from 'node:crypto';
import { evaluate } from '@niscorp/prism';
import { z } from 'zod';
import type { JsonObject } from '../../engine/contracts.js';
import {
  ChallengeSchema,
  PreparedImagesSchema,
  VisionResponseSchema,
  type ImageChallenge,
  type ImageChoiceProfile,
  type PreparedImages,
} from './contracts.js';

export const buildVisionRequest = (
  challenge: ImageChallenge,
  inputImages: PreparedImages,
  policy: ImageChoiceProfile['jev'],
): JsonObject => {
  const images = PreparedImagesSchema.parse(inputImages);
  if (
    JSON.stringify(challenge.tiles.map((tile) => tile.id).toSorted()) !==
    JSON.stringify(Object.keys(images).toSorted())
  )
    throw new Error('Prepared images must cover every challenge tile exactly once');
  const assets: JsonObject = {},
    tiles: JsonObject = {};
  for (const tile of challenge.tiles) {
    const image = images[tile.id];
    if (!image) throw new Error('Missing prepared image');
    const reference = randomUUID();
    assets[reference] = { type: 'image', ...image };
    tiles[tile.id] = reference;
  }
  return {
    model: policy.model,
    state: { instruction: challenge.instruction, tiles },
    assets,
    questions: Object.fromEntries(
      challenge.tiles.map((tile) => [
        tile.id,
        {
          type: 'noul',
          instructions: policy.question.replace('{id}', tile.id),
          criteria: { true: policy.trueCriterion, false: policy.falseCriterion },
        },
      ]),
    ),
  };
};
export const readVisionResponse = (
  input: unknown,
  challenge: ImageChallenge,
): z.infer<typeof VisionResponseSchema> => {
  const result = VisionResponseSchema.parse(input);
  if (
    JSON.stringify(Object.keys(result.answers).toSorted()) !==
    JSON.stringify(challenge.tiles.map((tile) => tile.id).toSorted())
  )
    throw new Error('Vision response must answer each challenge tile exactly once');
  return result;
};
export const selectImageChoices = (
  challenge: ImageChallenge,
  input: unknown,
  policy: ImageChoiceProfile['jev'],
): ImageChallenge['tiles'] =>
  z.array(ChallengeSchema.shape.tiles.element).parse(
    evaluate(policy.selection, {
      tiles: challenge.tiles,
      answers: readVisionResponse(input, challenge).answers,
      threshold: policy.threshold,
    }),
  );
export const buildFormSubmission = (
  challenge: ImageChallenge,
  selected: ImageChallenge['tiles'],
): { url: string; method: 'POST'; fields: ImageChallenge['hidden'] } => {
  const known = new Map(challenge.tiles.map((tile) => [tile.id, tile]));
  if (new Set(selected.map((tile) => tile.id)).size !== selected.length)
    throw new Error('Duplicate selected tile');
  const fields = [...challenge.hidden];
  for (const tile of selected) {
    const original = known.get(tile.id);
    if (!original) throw new Error('Unknown selected tile');
    fields.push({ name: original.name, value: original.value });
  }
  fields.push(challenge.submit);
  return { url: challenge.action, method: 'POST', fields };
};
