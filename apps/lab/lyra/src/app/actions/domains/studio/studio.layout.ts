import type { LayoutNode } from '@niscorp/nova';

export const studioSettingsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 24 },
  children: [
    { component: 'Hero', props: { eyebrow: '$.studioName', title: 'Appearance', lead: 'Pick a look. It applies to everyone at this studio, immediately.' } },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    {
      component: 'Row',
      props: { gap: 8, align: 'center' },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Currently wearing' },
        { component: 'Badge', props: { tone: 'accent', label: '$.currentThemeName' } },
      ],
    },

    {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.themes',
          loading: '$.loading',
          rowKey: 'theme_id',
          empty: 'No themes available.',
          columns: [
            { label: 'Theme', w: 2, cell: { kind: 'primary', key: 'name' } },
            { label: '', px: 108, align: 'right', cell: { kind: 'action', label: 'Apply', ref: 'apply', variant: 'outline' } },
          ],
        },
      },
    },

    {
      component: 'Text',
      props: { size: 'sm', color: 'mute' },
      // NO INTERNAL REFERENCES IN PRODUCT COPY. This said 'see PLAN.md' — a
      // file the person reading it cannot open and has never heard of.
      children: 'Colours and words for now. Studio-specific layouts are coming.',
    },

    // ── the language ────────────────────────────────────────
    {
      component: 'Card',
      props: { pad: 18 },
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          { component: 'Text', props: { size: 'lg', weight: 'semi' }, children: 'Language' },
          {
            component: 'Select',
            props: {
              label: 'What this studio reads in',
              hint: 'Applies to everyone here, and changes how dates and prices are written.',
              value: '$.currentLocale',
              options: '$.languages',
            },
            ref: 'language',
          },
          // The screen is about to be rebuilt underneath this instance, so the
          // only honest thing left to say is that it is happening.
          {
            if: '$.switching',
            then: { component: 'Notice', props: { tone: 'calm', message: 'Switching language — one moment.' } },
            else: '',
          },
        ],
      },
    },
  ],
};
