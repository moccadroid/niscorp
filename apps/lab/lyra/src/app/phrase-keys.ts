import { DEFAULT_PHRASE_KEYS } from '@niscorp/nova/i18n';
import type { PhraseKeys } from '@niscorp/nova/i18n';

// THIS APP'S DISPLAY-FIELD CONVENTION, declared once — and imported by BOTH
// halves of the language mechanism: `app.ts` hands it to the render pass,
// `dev/phrase-harvest.ts` walks the same keys at harvest time. This used to be
// two declarations, and they drifted: the pass translated `phrase`/`why`/
// `sentence` while the harvest could not see them, so a missing word was
// invisible to the one tool whose job is counting missing words.
//
// Every read that manufactures a word for a screen writes it to a
// `*_display` field (`status_display`, `term_display`, `paid_via_display`)
// — a convention the vex entries already followed for their own reasons.
// Naming it here is what makes the closed-set vocabulary a query invents
// translatable without listing forty field names, and without the pass
// ever touching a person's name or a plan's title.
// Four keys added to nova's default prose props, each for a place this app
// renders words that arrive as ROW DATA rather than as layout literals:
//   role     — the identity card shows a role LABEL ("Front desk"), not an id
//   phrase   — the automation vocabulary tables (`somebody joins`)
//   why      — a recipe card's body
//   sentence — a recipe card's subtitle, composed from moment + effect
//
// Deliberately NOT added: anything a form is about to SAVE. A recipe's
// email subject and body reach the screen as `Input` values, and `value` is
// not a prose key — translating one would show German and save English.
// That line is the difference between chrome and content: this pass owns
// the words the application says, never the words a studio wrote.
export const PHRASE_KEYS: PhraseKeys = {
  props: [...DEFAULT_PHRASE_KEYS.props, 'role', 'phrase', 'why', 'sentence'],
  suffixes: ['_display'],
};
