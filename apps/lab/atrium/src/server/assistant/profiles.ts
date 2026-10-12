import { MODELS } from '@atrium/app/actions/domains/staff/models';
import type { ModelChoice } from '@atrium/app/actions/domains/staff/models';

export type Profile = {
  places: readonly string[];
  watches: boolean;
};

export type ModelTuning = {
  steps: number;
  seconds: number;
  reasoning: boolean;
};

const DEFAULT_TUNING: ModelTuning = { steps: 6, seconds: 45, reasoning: true };

const TUNING: Record<string, ModelTuning> = {
  'z-ai/glm-5.2': { steps: 12, seconds: 120, reasoning: false },
  'qwen/qwen3.8-27b': { steps: 6, seconds: 45, reasoning: true },
  'openai/gpt-oss-120b': { steps: 6, seconds: 45, reasoning: true },
};

export const tuningFor = (model: string): ModelTuning => TUNING[model] ?? DEFAULT_TUNING;

export const modelOf = (key: string | undefined): ModelChoice => MODELS[key ?? ''] ?? MODELS[''] ?? { provider: '', model: '', title: '', blurb: '' };

export const PROFILES: Record<string, Profile> = {
  authored: { places: [], watches: false },
  mixed: { places: ['aside'], watches: true },
  full: { places: ['work', 'detail', 'aside'], watches: true },
};

const FALLBACK: Profile = PROFILES['mixed'] ?? { places: [], watches: false };

export const profileOf = (layoutControl: string | undefined): Profile => PROFILES[layoutControl ?? 'mixed'] ?? FALLBACK;

// Not bounded by `layout_control`: that dial bounds what the watcher does
// unasked, and an answer to a person is bounded by the screen they work in.
export const chatPlacesFor = (audience: string): readonly string[] => (audience === 'guest' ? ['sheet'] : ['work', 'detail', 'aside']);

export const scopeOf = (places: readonly string[]): 'all' | 'aside' | 'none' =>
  ['work', 'detail', 'aside'].every((canvas) => places.includes(canvas)) ? 'all' : places.includes('aside') ? 'aside' : 'none';

export const STAFF_SCREEN = [
  'The user\'s screen has a menu across the top and three columns under it. The columns are called canvases.',
  '',
  '  work    left column, widest. Holds a list the user works through.',
  '  detail  middle column. Holds one record opened from that list.',
  '  aside   right column. Holds what you offer alongside that record.',
  '',
  '`work` and `detail` show one card at a time. A card placed on either covers the card already there.',
  '`aside` is a list. It shows every card on it, in the order you give them.',
].join('\n');

export const GUEST_SCREEN = [
  'The user\'s screen is a phone page. Two canvases matter here.',
  '',
  '  home    the page itself — a list of cards, one per thing the hotel offers, each showing one live line. The user taps a card to expand it in place.',
  '  sheet   an overlay over the page. Everything you open goes here and closes back to home.',
  '',
  '`sheet` shows one card at a time. A card placed on it covers the card already there.',
].join('\n');

export const COLUMN_NOTES: Record<string, string> = {
  sheet: 'an overlay over the user\'s home screen. Everything you open for a guest goes here and closes back to it.',
  main: 'the user\'s whole screen. Change it only when the user asks to move to a different one.',
  work: 'change it only to move the user to a different list',
  detail: 'put a card here only to change which record the user is reading',
  aside: 'the action you are offering goes here',
};
