import type { CacheEntry, MutationEntry } from './index';

// The LOOK, as data.
//
// `studios` is scoped on `id`, so this read answers for the caller's own studio
// and no other — a theme read cannot be pointed at somebody else's studio any
// more than a member read can.
//
// Read as an endpoint rather than taken only from `inputs`: boot input is fixed
// at shell build, so a studio that changed its palette would keep the old one
// until somebody reloaded. Chrome loads this on mount and re-loads when a
// change announces itself, which is what makes a theme swap land on screens
// that are already open.
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
  // Absent is the STOCK palette, not an error: `{}` applies nothing and the
  // stylesheet's own values stand. A studio that never customised anything
  // takes the same code path as one that did.
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

// Changing the look is one column on one row.
//
// I first wrote this with `where: { isNotNull: 'studios.id' }`, reasoning that
// the engine's own `match: 'id' → studioId` behavior would narrow it to the
// caller's row anyway, and that a statement carrying no studio id has nothing
// to forge. Vex's `lintMutation` refused it at seed:
//
//   update on "studios" has no $context-keyed WHERE — the write is not caller-bounded
//
// The lint is right and I was wrong. A write whose only bound is an injected
// clause is one behaviors edit away from being a blanket update, and the
// grammar declines to store that shape at all. `$scope` is unauthorable here
// for the same reason — tenancy is the engine's to place, never a stored
// statement's.
//
// So the caller names the row, and the engine ANDs its own match on top: the
// authored condition and the injected one must BOTH hold, so a forged studioId
// selects nothing rather than somebody else's studio. The id itself comes from
// `studio/current`, which is already scoped — the action reads its own subject
// rather than being told what it is.
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
