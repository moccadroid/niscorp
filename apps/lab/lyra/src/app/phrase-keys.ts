import { DEFAULT_PHRASE_KEYS } from '@niscorp/nova/i18n';
import type { PhraseKeys } from '@niscorp/nova/i18n';

// Nothing a form saves is a key: translating an `Input`'s `value` would show
// German and save English.
export const PHRASE_KEYS: PhraseKeys = {
  props: [...DEFAULT_PHRASE_KEYS.props, 'role', 'phrase', 'why', 'sentence', 'sub'],
  suffixes: ['_display', '_label'],
};
