// ═══════════════════════════════════════════════════════════
// @niscorp/nova/i18n — the language surface.
//
// THE SWAP ITSELF IS NOT HERE. It runs inside the renderer, at the moment a
// RenderNode is minted (`layout/renderer.ts`), and a host turns it on by
// naming a book: `createShell({ phrases, phraseKeys })`, or the same two
// fields on any `RenderContext`. That is why an adapter — react, dom, tty,
// ink, one nobody has written — contains no i18n code at all: words arrive
// already in the reader's language, and translating in the adapter would be a
// job every future adapter inherits.
//
// What lives here is everything around that swap:
//   - `harvest*` reads the phrases an application COULD show, from its
//     authored artifacts, so filling a book is mechanical rather than a human
//     reading every screen.
//   - `translateRenderTree` is for whoever holds a tree they did not render.
//   - `fillPhrase` reads a counted phrase held as data rather than shown.
//   - the phrase-key vocabulary both halves share.
//
// Nova holds no dictionary and knows no languages — the host supplies both,
// exactly as it supplies the transform evaluator.
//
// See `phrases.ts` for what this approach buys, what it costs, and where the
// rest of an application's i18n has to live.
// ═══════════════════════════════════════════════════════════

export { translateRenderTree } from './translate';
export type { TranslateOptions } from './translate';

// For values held OUTSIDE a render — the renderer fills patterns on the way to
// a screen, so this is for whoever has one as data instead.
export { fillPhrase } from './swap';

export { harvestLayout, harvestDefinition, harvestDefinitions, missingFrom } from './harvest';
export type { HarvestedPhrase } from './harvest';

export { DEFAULT_PHRASE_KEYS, isBinding, isPhrase, matcherFor } from './phrases';
export type { Phrasebook, PhraseKeys, PhraseKeyMatcher } from './phrases';
