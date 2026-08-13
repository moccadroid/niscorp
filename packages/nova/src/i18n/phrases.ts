// ═══════════════════════════════════════════════════════════
// NOVA IS LANGUAGE-BLIND, the same way it is surface-blind.
//
// The core renders a layout into a `RenderNode` tree and knows nothing about
// what language the words in it are. This area adds one late pass over that
// tree — swap the words, leave the structure — plus the harvester that tells
// you which words there are to swap.
//
// WHY A LATE PASS AND NOT A `$t` IN THE LAYOUT. Both work; they cost
// differently. A key-per-string layout (`label: '@t.people.add'`) is precise
// and makes every layout in the application unreadable — the file stops saying
// what it draws. A late pass leaves the layouts as the readable English they
// already are and moves the whole problem to one walk, at the price of keying
// the dictionary on the source string rather than on an invented id.
//
// The price is real and worth naming: English-as-key cannot distinguish two
// senses of one word. "Book" the verb and "Book" the noun are one key here and
// two words in German. When that bites, the answer is not to abandon the pass
// — it is to disambiguate that one string at its author site, and a `$t`
// directive is the natural place for it. The two compose; this is the layer
// that makes the other one optional rather than mandatory.
//
// WHAT THIS PASS CANNOT DO, and where the rest of the work goes:
//   - Open-ended formatted values — dates, money, counts. "Fri 14 Mar" has
//     unbounded cardinality and no dictionary will ever hold it. Those are
//     formatted at their source with a locale (prism's `$localeDate`,
//     `$localeMoney`, `$localeNumber`).
//   - Anything not in the tree: a server error message, a notification body.
// ═══════════════════════════════════════════════════════════

/** Source phrase → the words a reader of this locale should see. */
export type Phrasebook = Readonly<Record<string, string>>;

// WHICH STRINGS IN A TREE ARE PROSE, declared by the host rather than guessed.
//
// A render tree is mostly not prose. It carries person names, ids, css values,
// tone words, icon names and row data, and a pass that translated every string
// it found would rename a member called "Pass" the first time somebody bought
// one. So the host names the carriers, and everything else is left alone.
export type PhraseKeys = {
  // Prop names whose string values are prose: `label`, `title`, `placeholder`.
  // Matched at ANY depth inside a prop value, which is what makes a spec prop
  // work — a `Table`'s `columns: [{ label }]` and a `Select`'s
  // `options: [{ label }]` are the same rule as a bare `label`.
  props?: readonly string[];
  // Suffixes marking a DATA field as a display string. An app that spells its
  // read-time display fields `status_display`, `term_display` declares
  // `['_display']` once here, and every closed-set word a query manufactures
  // becomes translatable without the app naming them one by one.
  //
  // Only for CLOSED sets. A `_display` field holding a formatted date or an
  // amount will simply miss, every time, and should be formatted with a locale
  // at its source instead.
  suffixes?: readonly string[];
  // Translate bare text nodes (a layout's literal children). Default: true.
  text?: boolean;
};

export const DEFAULT_PHRASE_KEYS: Required<Pick<PhraseKeys, 'props' | 'text'>> = {
  // A starting set, not a standard — an app with its own vocabulary passes its
  // own. Deliberately absent: `name`, `value`, `id`, `icon`, `tone`, `variant`,
  // `key`. Those carry data or design tokens, and translating them is how a
  // person called "Active" gets renamed.
  props: [
    'label',
    'title',
    'subtitle',
    'heading',
    'eyebrow',
    'lead',
    'blurb',
    'placeholder',
    'hint',
    'help',
    'message',
    'empty',
    'emptyHint',
    'emptyLabel',
    'noMatch',
    'caption',
    'description',
    'confirmLabel',
    'cancelLabel',
    'alt',
    'tooltip',
  ],
  text: true,
};

export type PhraseKeyMatcher = {
  isProse: (key: string) => boolean;
  text: boolean;
};

export const matcherFor = (keys: PhraseKeys | undefined): PhraseKeyMatcher => {
  const props = new Set(keys?.props ?? DEFAULT_PHRASE_KEYS.props);
  const suffixes = keys?.suffixes ?? [];
  return {
    isProse: (key: string): boolean => props.has(key) || suffixes.some((suffix) => key.endsWith(suffix)),
    text: keys?.text ?? DEFAULT_PHRASE_KEYS.text,
  };
};

// A string that is a BINDING resolves to data at render time, so it is never a
// phrase: harvesting `'$.member.person_name'` would put a path in the
// dictionary and translating it would do nothing.
//
// Three forms, matching what the resolver recognises
// (`shared/bindings/resolve.ts`): a bare `$` path, a `{{ }}` template, and an
// `@`-prefixed EXTRA scope. The last one is easy to forget and shows up
// immediately — a trigger's `{ set: 'x', value: '@event.payload.theme_id' }`
// is a step's plumbing, and a harvester without this rule fills a language
// file with several dozen of them.
const BARE_PATH = /^\$(\.|[A-Za-z_]|$)/;
const EXTRA_SCOPE = /^@[A-Za-z_]/;

export const isBinding = (value: string): boolean =>
  BARE_PATH.test(value) || EXTRA_SCOPE.test(value) || value.includes('{{');

// Worth translating at all: a non-empty string that is not a binding and is not
// obviously machine vocabulary. The last clause is a cheap guard against
// harvesting css values and tokens that happen to sit at an allowlisted key.
export const isPhrase = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed === '' || isBinding(trimmed)) return false;
  // A phrase has a letter in it. '—', '18:30', '#fff', '100%' do not.
  return /\p{L}/u.test(trimmed);
};
