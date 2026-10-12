import { studioCurrent, studioSetBusiness, studioSetLegalForm } from '@lyra/app/vex/studio.entries';
import { localeCurrent, studioSetLocale, studioSetTheme, themeCurrent, themesList } from '@lyra/app/vex/theme.entries';

export const themesListPrism = { fingerprint: themesList.fingerprint, context: {} };
export const themeCurrentPrism = { fingerprint: themeCurrent.fingerprint, context: {} };

export const studioSelfPrism = { fingerprint: studioCurrent.fingerprint, context: {} };

// The engine ANDs its own `id = <caller's studio>` onto the authored condition,
// so a forged `studioId` selects nothing.
export const setThemePrism = {
  fingerprint: studioSetTheme.fingerprint,
  context: { studioId: { $ref: '$.studioId' }, themeId: { $ref: '$.pendingThemeId' } },
};

export const localeCurrentPrism = { fingerprint: localeCurrent.fingerprint, context: {} };

export const setLegalFormPrism = {
  fingerprint: studioSetLegalForm.fingerprint,
  context: { studioId: { $ref: '$.studioId' }, legalForm: { $ref: '$.pendingLegalForm' } },
};

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
