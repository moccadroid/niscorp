import type { LayoutNode } from '@niscorp/nova';

// The owner's one settings surface: what this studio looks like.
//
// Applying a theme is a row write, and the screen it changes is the one you are
// standing on — the chrome hears `theme-changed` and re-reads, so the palette
// swaps under you without a reload. That is the demo, and it is also just how
// the app works.
export const studioSettingsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 24 },
  children: [
    { component: 'Hero', props: { eyebrow: '$.studioName', title: 'Appearance', lead: 'Pick a look. It applies to everyone at this studio, immediately.' } },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    // Which one is on, said once above the list rather than marked per row.
    // Computing "is this the current one" per row would need the studio's
    // theme inside the theme list — a join that returns exactly one row —
    // and a layout comparing two values is a layout making a decision.
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
      children: 'Colours for now. Studio-specific layouts are coming.',
    },
  ],
};
