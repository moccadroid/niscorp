import { studioCurrent } from '@lyra/app/vex/studio.entries';
import { localeCurrent, studioSetLocale, studioSetTheme, themeCurrent, themesList } from '@lyra/app/vex/theme.entries';

export const themesListPrism = { fingerprint: themesList.fingerprint, context: {} };
export const themeCurrentPrism = { fingerprint: themeCurrent.fingerprint, context: {} };

export const studioSelfPrism = { fingerprint: studioCurrent.fingerprint, context: {} };

// The engine ANDs its own `id = <caller's studio>` onto the authored condition,
// so both must hold — a forged studioId selects nothing.
export const setThemePrism = {
  fingerprint: studioSetTheme.fingerprint,
  context: { studioId: { $ref: '$.studioId' }, themeId: { $ref: '$.pendingThemeId' } },
};

// ── the language ─────────────────────────────────────────────

export const localeCurrentPrism = { fingerprint: localeCurrent.fingerprint, context: {} };

export const setLocalePrism = {
  fingerprint: studioSetLocale.fingerprint,
  context: { studioId: { $ref: '$.studioId' }, locale: { $ref: '$.pendingLocale' } },
};
