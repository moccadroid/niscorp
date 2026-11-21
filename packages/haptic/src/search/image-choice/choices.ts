import type { ImageChallenge } from './contracts.js';

// The challenge form's POST: its hidden fields, the chosen tiles' checkboxes, then the submit button.
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
