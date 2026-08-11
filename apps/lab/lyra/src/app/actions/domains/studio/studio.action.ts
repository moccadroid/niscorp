import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { studioSettingsLayout } from './studio.layout';
import { setThemePrism, studioSelfPrism, themeCurrentPrism, themesListPrism } from './studio.prism';

// The owner's appearance settings.
//
// Owner-only by ring 1 (`studio.*` in the charter) AND by ring 3 (only the
// owner holds `studios.write.update`). A manager who reached this fingerprint
// by hand would be refused at the engine — the screen is not the boundary.
//
// The list is marked up rather than filtered: every theme is shown, and the one
// in use says so and offers no button. Which theme is current arrives as a row
// field computed in `onSuccess`, not by a layout comparing values.
export const studioSettingsAction: ActionDefinition = {
  id: 'studio.settings',
  title: 'Appearance',
  data: {
    studioId: '',
    studioName: '',
    themes: [],
    currentThemeId: '',
    currentThemeName: 'Stock',
    themeRows: [],
    currentRow: {},
    studioRow: {},
    pendingThemeId: '',
    loading: true,
    error: '',
  },
  layout: studioSettingsLayout,
  endpoints: {
    self: { url: '/api/studio/vex', method: 'POST', request: studioSelfPrism, target: 'studioRow' },
    load: { url: '/api/studio/vex', method: 'POST', request: themesListPrism, target: 'themeRows' },
    current: { url: '/api/studio/vex', method: 'POST', request: themeCurrentPrism, target: 'currentRow' },
    apply: { url: '/api/studio/vex', method: 'POST', request: setThemePrism, errorTarget: 'error' },
  },
  lifecycle: {
    mount: [
      { call: 'self', onSuccess: [{ set: 'studioId', value: '$.studioRow.studio_id' }, { set: 'studioName', value: '$.studioRow.name' }] },
      { call: 'current', onSuccess: [{ set: 'currentThemeId', value: '$.currentRow.theme_id' }, { set: 'currentThemeName', value: '$.currentRow.name' }] },
      { call: 'load', onSuccess: [{ set: 'themes', value: '$.themeRows' }, { set: 'loading', value: false }] },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'apply',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingThemeId', value: '@event.payload.theme_id' },
        {
          call: 'apply',
          // Announce, then re-read. The chrome is a different action on a
          // different canvas and hears the same channel — which is how the
          // palette changes under somebody who is standing on this screen.
          onSuccess: [
            { emit: { channel: 'theme-changed' } },
            { call: 'current', onSuccess: [{ set: 'currentThemeId', value: '$.currentRow.theme_id' }, { set: 'currentThemeName', value: '$.currentRow.name' }] },
          ],
        },
      ],
    },
  ],
};

export const studioSettingsInputSchema = z.toJSONSchema(
  z.object({
    studioId: z.string().optional().describe('Seeded from the session; the engine narrows the write to it regardless.'),
    studioName: z.string().optional().describe('For the heading. Seeded from the session.'),
  }),
);
