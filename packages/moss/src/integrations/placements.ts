import type { Bundle } from './bundle';

// The sentence both decision screens print — the approval card and the store
// tile say WHAT APPEARS WHERE from the same declarations, derived once here so
// neither can drift from what intake actually accepted.
export const describePlacements = (bundle: Bundle, names: Readonly<Record<string, string>> = {}): string => {
  // IDS ARE FOR WIRES; THIS SENTENCE IS FOR A PERSON.
  //
  // It is printed on the approval card and on the store tile — both read by
  // somebody deciding whether to turn an integration on — and `hub.money` told them
  // nothing they did not already have to guess. The host supplies the words for
  // its own hubs and screens (`placementNames`, ./feature.ts); anything it has no word
  // for falls back to the id, which is honest rather than blank.
  const say = (id: string): string => names[id] ?? id;
  const parts: string[] = [];
  for (const [actionId, binding] of Object.entries(bundle.attachments)) {
    const host = typeof binding === 'string' ? binding : binding.to;
    parts.push(`a "${bundle.actions[actionId]?.title ?? actionId}" panel on ${say(host)}`);
  }
  for (const [actionId, hub] of Object.entries(bundle.placements)) {
    parts.push(`"${bundle.actions[actionId]?.title ?? actionId}" under ${say(hub)}`);
  }
  if (bundle.settings !== '') parts.push('a settings screen on its store tile');
  return parts.length === 0 ? '' : `Adds ${parts.join(' · ')}.`;
};
