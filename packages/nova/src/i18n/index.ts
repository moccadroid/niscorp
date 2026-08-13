// ═══════════════════════════════════════════════════════════
// @niscorp/nova/i18n — the language pass.
//
// Two halves of one idea: `harvest*` reads the phrases an application could
// show, `translateRenderTree` swaps them on the way out. Nova itself holds no
// dictionary and knows no languages — the host supplies both, exactly as it
// supplies the transform evaluator.
//
// See `phrases.ts` for what this approach buys, what it costs, and where the
// rest of an application's i18n has to live.
// ═══════════════════════════════════════════════════════════

export { translateRenderTree } from './translate';
export type { TranslateOptions } from './translate';

export { harvestLayout, harvestDefinition, harvestDefinitions, missingFrom } from './harvest';
export type { HarvestedPhrase } from './harvest';

export { DEFAULT_PHRASE_KEYS, isBinding, isPhrase, matcherFor } from './phrases';
export type { Phrasebook, PhraseKeys, PhraseKeyMatcher } from './phrases';
