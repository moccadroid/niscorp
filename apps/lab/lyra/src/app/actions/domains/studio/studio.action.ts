import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { studioSettingsLayout } from './studio.layout';
import { localeCurrentPrism, setLegalFormPrism, setLocalePrism, setThemePrism, studioSelfPrism, themeCurrentPrism, themesListPrism } from './studio.prism';

export const studioSettingsAction: ActionDefinition = {
  id: 'studio.settings',
  title: 'Appearance',
  data: {
    studioId: '',
    studioName: '',
    pendingLegalForm: '',
    legalSaved: false,
    themes: [],
    currentThemeId: '',
    currentThemeName: 'Stock',
    themeRows: [],
    currentRow: {},
    studioRow: {},
    pendingThemeId: '',
    // ── the language ──
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
    // The language: one read for what is on offer (server knowledge — see
    // world.ts), one for what is worn, one write, one resync.
    languages: { fn: 'world.languages', target: 'languages' },
    locale: { url: '/api/studio/vex', method: 'POST', request: localeCurrentPrism, target: 'localeRow' },
    setLocale: { url: '/api/studio/vex', method: 'POST', request: setLocalePrism, errorTarget: 'error' },
    setLegalForm: { url: '/api/studio/vex', method: 'POST', request: setLegalFormPrism, errorTarget: 'error' },
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
    // CHANGING THE LANGUAGE ENDS THIS SCREEN'S LIFE, and that is the correct
    // behaviour rather than a limitation. The words a shell wears are read when
    // the shell is built, so `world.relanguage` rebuilds it — this instance is
    // disposed mid-step and what the terminal receives is the whole application
    // again, in the new language, on its home screen.
    //
    // Hence `switching`: the only thing this screen can usefully say afterwards
    // is that it is going, so it says that and stops.
    {
      // Saved on choosing, like the language beside it: a Select with a Save
      // button next to it is two acts for one decision.
      event: 'ui:model',
      ref: 'legalForm',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingLegalForm', value: '@event.payload' },
        { call: 'setLegalForm', onSuccess: [{ set: 'legalSaved', value: true }, { call: 'self' }] },
      ],
    },
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
