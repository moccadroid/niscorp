import { studioCurrent, studioSetBusiness, studioSetLegalForm } from '@lyra/app/vex/studio.entries';
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

// WHAT KIND OF BUSINESS THIS STUDIO IS — the field a payment provider needs and
// nobody could answer. `pendingLegalForm` rather than the current value, for the
// same reason the locale write uses a pending key: a Select's own model holds
// what is displayed, and the write must carry what was just CHOSEN.
export const setLegalFormPrism = {
  fingerprint: studioSetLegalForm.fingerprint,
  context: { studioId: { $ref: '$.studioId' }, legalForm: { $ref: '$.pendingLegalForm' } },
};

// The three a payment provider asks for before it will compute tax or move
// money. Saved together because they are one answer to one question.
export const setBusinessPrism = {
  fingerprint: studioSetBusiness.fingerprint,
  context: {
    studioId: { $ref: '$.studioId' },
    legalName: { $ref: '$.legalName' },
    address: { $ref: '$.address' },
    vatId: { $ref: '$.vatId' },
  },
};

export const setLocalePrism = {
  fingerprint: studioSetLocale.fingerprint,
  context: { studioId: { $ref: '$.studioId' }, locale: { $ref: '$.pendingLocale' } },
};
