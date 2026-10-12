export type Phrasebook = Readonly<Record<string, string>>;

export type PhraseKeys = {
  props?: readonly string[];
  suffixes?: readonly string[];
  text?: boolean;
};

export const DEFAULT_PHRASE_KEYS: Required<Pick<PhraseKeys, 'props' | 'text'>> = {
  // `name`, `value`, `id`, `icon`, `tone`, `variant` and `key` are left out on
  // purpose: they carry data or design tokens, and translating them renames a
  // person called "Active".
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

const BARE_PATH = /^\$(\.|[A-Za-z_]|$)/;
const EXTRA_SCOPE = /^@[A-Za-z_]/;

export const isBinding = (value: string): boolean =>
  BARE_PATH.test(value) || EXTRA_SCOPE.test(value) || value.includes('{{');

export const isPhrase = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed === '' || isBinding(trimmed)) return false;
  return /\p{L}/u.test(trimmed);
};
