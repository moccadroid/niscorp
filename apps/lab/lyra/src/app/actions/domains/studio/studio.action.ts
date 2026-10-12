import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { studioSettingsLayout } from './studio.layout';
import { localeCurrentPrism, setLocalePrism, setThemePrism, studioSelfPrism, themeCurrentPrism, themesListPrism } from './studio.prism';

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
    languages: [],
    currentLocale: '',
    localeRow: {},
    pendingLocale: '',
    switching: false,
    loading: true,
    error: '',
  },
  layout: studioSettingsLayout,
  endpoints: {
    self: { url: '/api/studio/vex', method: 'POST', request: studioSelfPrism, target: 'studioRow' },
    load: { url: '/api/studio/vex', method: 'POST', request: themesListPrism, target: 'themeRows' },
    current: { url: '/api/studio/vex', method: 'POST', request: themeCurrentPrism, target: 'currentRow' },
    apply: { url: '/api/studio/vex', method: 'POST', request: setThemePrism, errorTarget: 'error' },
    languages: { fn: 'world.languages', target: 'languages' },
    locale: { url: '/api/studio/vex', method: 'POST', request: localeCurrentPrism, target: 'localeRow' },
    setLocale: { url: '/api/studio/vex', method: 'POST', request: setLocalePrism, errorTarget: 'error' },
    relanguage: { fn: 'world.relanguage' },
  },
  lifecycle: {
    mount: [
      { call: 'self', onSuccess: [{ set: 'studioId', value: '$.studioRow.studio_id' }, { set: 'studioName', value: '$.studioRow.name' }] },
      { call: 'current', onSuccess: [{ set: 'currentThemeId', value: '$.currentRow.theme_id' }, { set: 'currentThemeName', value: '$.currentRow.name' }] },
      { call: 'locale', onSuccess: [{ set: 'currentLocale', value: '$.localeRow.locale' }] },
      { call: 'languages' },
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
          onSuccess: [
            { emit: { channel: 'theme-changed' } },
            { call: 'current', onSuccess: [{ set: 'currentThemeId', value: '$.currentRow.theme_id' }, { set: 'currentThemeName', value: '$.currentRow.name' }] },
          ],
        },
      ],
    },
    // `world.relanguage` rebuilds the shell, so this instance is disposed
    // mid-step: `switching` is the last thing it says and is never set back.
    {
      event: 'ui:model',
      ref: 'language',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingLocale', value: '@event.payload' },
        {
          call: 'setLocale',
          onSuccess: [{ set: 'switching', value: true }, { call: 'relanguage' }],
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
