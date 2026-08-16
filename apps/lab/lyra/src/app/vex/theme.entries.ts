import type { CacheEntry, MutationEntry } from './index';

const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: fallback } } });

export const themeCurrent: CacheEntry = {
  fingerprint: 'theme/current',
  intent: "The token set this studio wears, or empty for the stock look",
  shape: { theme_id: '', name: '', tokens: {} },
  dsl: {
    from: ['studios', 'themes'],
    fields: [
      { field: 'themes.id', as: 'theme_id' },
      { field: 'themes.name', as: 'name' },
      'themes.tokens',
    ],
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: { theme_id: one('theme_id'), name: one('name', 'Stock'), tokens: one('tokens', {}) },
    },
  },
};

// The catalog an owner picks from. Themes are PLATFORM artifacts — offered to
// studios, not owned by one — so this is deliberately unscoped.
export const themesList: CacheEntry = {
  fingerprint: 'themes/list',
  intent: 'Every theme a studio may wear',
  shape: [{ theme_id: '', name: '' }],
  dsl: {
    from: ['themes'],
    fields: [{ field: 'themes.id', as: 'theme_id' }, 'themes.name'],
    sort: [{ field: 'themes.name', dir: 'asc' }],
  },
};

// ── the words ────────────────────────────────────────────────
//
// Same shape as the theme above, because it is the same kind of decision. The
// options are read from the `phrases` table rather than listed: a language this
// deployment holds no words for is not a language it can offer, and a hardcoded
// list would offer it anyway.
export const localeCurrent: CacheEntry = {
  fingerprint: 'locale/current',
  intent: 'The language this studio reads in',
  shape: { locale: '' },
  dsl: { from: ['studios'], fields: ['studios.locale'] },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { locale: one('locale', 'en') } } },
};

// WHICH LANGUAGES ARE ON OFFER is deliberately NOT an entry here.
//
// The obvious query — DISTINCT locale FROM phrases — is wrong in a way worth
// recording: the SOURCE language has no rows in that table, by construction,
// because nothing about it needs translating. A studio reading English would
// be offered every language except the one it is already in, and switching
// back would be impossible.
//
// So the offer is "the source language, plus every language we hold words for",
// which is a fact about the loaded server rather than about a table. It is the
// `world.languages` endpoint (server/functions/world.ts), where the language
// names also come from `Intl.DisplayNames` instead of a hand-kept list.

// The caller NAMES the row and the engine ANDs its own match on top. Relying on
// the injected clause alone is refused at seed by vex's `lintMutation`: a write
// whose only bound is injected is one behaviors edit away from a blanket update.
export const studioSetLocale: MutationEntry = {
  fingerprint: 'studio/set-language',
  intent: 'Set which language this studio reads in',
  mutation: {
    op: 'update',
    table: 'studios',
    set: { locale: { $context: 'locale' } },
    where: { eq: ['studios.id', { $context: 'studioId' }] },
  },
};

export const studioSetTheme: MutationEntry = {
  fingerprint: 'studio/set-theme',
  intent: 'Set which theme this studio wears',
  mutation: {
    op: 'update',
    table: 'studios',
    set: { theme_id: { $context: 'themeId' } },
    where: { eq: ['studios.id', { $context: 'studioId' }] },
  },
};
