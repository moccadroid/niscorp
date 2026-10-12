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

// Unscoped on purpose: themes are offered to every studio and owned by none.
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

export const localeCurrent: CacheEntry = {
  fingerprint: 'locale/current',
  intent: 'The language this studio reads in',
  shape: { locale: '' },
  dsl: { from: ['studios'], fields: ['studios.locale'] },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { locale: one('locale', 'en') } } },
};

// The caller names the row and the engine ANDs its own match on top: vex's
// `lintMutation` refuses at seed a write whose only bound is the injected one.
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
