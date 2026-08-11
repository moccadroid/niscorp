import { studioCurrent } from '@lyra/app/vex/studio.entries';
import { studioSetTheme, themeCurrent, themesList } from '@lyra/app/vex/theme.entries';

export const themesListPrism = { fingerprint: themesList.fingerprint, context: {} };
export const themeCurrentPrism = { fingerprint: themeCurrent.fingerprint, context: {} };

// The action reads its own subject rather than being told what it is.
//
// `inputs` seeds a canvas at BOOT, and this surface is reset onto the canvas
// afterwards — so a server-seeded studio id arrived empty and the write
// silently matched nothing. `studio/current` is already scoped to the caller,
// so reading it is both correct and self-contained: no plumbing, and the id can
// only ever be the caller's own.
export const studioSelfPrism = { fingerprint: studioCurrent.fingerprint, context: {} };

// The engine ANDs its own `id = <caller's studio>` onto the authored condition,
// so both must hold — a forged studioId selects nothing.
export const setThemePrism = {
  fingerprint: studioSetTheme.fingerprint,
  context: { studioId: { $ref: '$.studioId' }, themeId: { $ref: '$.pendingThemeId' } },
};
