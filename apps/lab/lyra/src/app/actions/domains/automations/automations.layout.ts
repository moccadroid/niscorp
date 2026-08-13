import type { LayoutNode } from '@niscorp/nova';

export const automationsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'center' },
      children: [
        {
          component: 'Hero',
          props: {
            title: 'Automations',
            lead: 'The things that happen without anybody doing them. Preview one to see exactly what it would do before it does anything.',
          },
        },
        { component: 'Tabs', props: { value: '$.view', options: '$.views' }, ref: 'view' },
      ],
    },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    { if: '$.notice', then: { component: 'Notice', props: { tone: 'good', message: '$.notice' } }, else: '' },

    // ── RECIPES ────────────────────────────────────────────────
    {
      if: '$.showRecipes',
      then: {
        component: 'Stack',
        props: { gap: 14 },
        children: [
          {
            component: 'Cards',
            props: {
              rows: '$.recipes',
              rowKey: 'id',
              titleKey: 'title',
              subtitleKey: 'sentence',
              bodyKey: 'why',
              iconKey: 'icon',
              badgeKey: 'state_label',
              badgeToneKey: 'state_tone',
              columns: 320,
              actions: [
                { label: 'Set it up', ref: 'useRecipe', variant: 'solid', icon: 'plus', hideKey: 'installed' },
                { label: 'Change it', ref: 'useRecipe', variant: 'ghost', icon: 'edit', showKey: 'installed' },
              ],
              empty: 'No recipes in this version.',
            },
          },
          {
            component: 'Prose',
            props: { size: 'sm', color: 'mute' },
            children:
              'A recipe fills the form in for you — it does not switch anything on. You read the words, change what you want, and save. Nothing goes out until you do.',
          },
        ],
      },
      else: '',
    },

    // ── WHAT IS RUNNING ────────────────────────────────────────
    {
      if: '$.showRunning',
      then: {
        component: 'Stack',
        props: { gap: 14 },
        children: [
          {
            component: 'Row',
            props: { justify: 'between', align: 'center' },
            children: [
              { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.runningHint' },
              { component: 'Button', props: { variant: 'outline', label: 'Build one from scratch' }, ref: 'add' },
            ],
          },
          {
            component: 'Cards',
            props: {
              rows: '$.reflexes',
              rowKey: 'automation_id',
              titleKey: 'name',
              subtitleKey: 'run_display',
              bodyKey: 'intent',
              badgeKey: 'state_label',
              badgeToneKey: 'state_tone',
              factsKey: 'facts',
              loading: '$.loading',
              columns: 340,
              actions: [
                { label: 'Preview', ref: 'preview', variant: 'outline', icon: 'eye' },
                { label: 'Run now', ref: 'run', variant: 'ghost', icon: 'play', hideKey: 'watched' },
                { label: 'Edit', ref: 'edit', variant: 'ghost', icon: 'edit' },
                { label: 'Pause', ref: 'pause', variant: 'ghost', hideKey: 'paused' },
                { label: 'Arm', ref: 'arm', variant: 'ghost', showKey: 'paused' },
              ],
              empty: 'Nothing is automated yet.',
              emptyHint: 'The recipes tab has eight things studios usually want.',
              emptyIcon: 'automation',
            },
          },
        ],
      },
      else: '',
    },

    // ── the outbox, and what it admits ─────────────────────────
    {
      if: '$.showOutbox',
      then: {
        component: 'Section',
        props: {
          title: 'Outbox',
          subtitle: 'What the automations would send. Nothing is delivered — Lyra has no mail integration yet, so these are queued and stay queued.',
        },
        children: {
          component: 'Card',
          props: { flush: true },
          children: {
            component: 'Rows',
            props: {
              rows: '$.outbox',
              rowKey: 'message_id',
              empty: 'Nothing queued.',
              emptyHint: 'An automation with an email effect puts its messages here.',
              emptyIcon: 'mail',
              columns: [
                { label: 'Message', w: 2, cell: { kind: 'primary', key: 'subject', subKey: 'to_address' } },
                { label: '', px: 96, align: 'right', cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
              ],
            },
          },
        },
      },
      else: '',
    },

    {
      component: 'Sheet',
      props: { open: '$.previewOpen', title: 'What it would do' },
      ref: 'closePreview',
      children: {
        component: 'Stack',
        props: { gap: 14 },
        children: [
          { component: 'Text', props: { weight: 'semi' }, children: '$.previewName' },
          { component: 'Prose', props: { color: 'soft' }, children: '$.previewSummary' },
          {
            if: '$.previewAnyone',
            then: {
              component: 'Cards',
              props: {
                rows: '$.previewUnits',
                rowKey: 'unit',
                titleKey: 'who',
                subtitleKey: 'to',
                bodyKey: 'body',
                badgeKey: 'subject',
                badgeTone: 'calm',
                empty: 'Nobody is due.',
              },
            },
            // Said by the fn, not the layout: "come back later" is true of a
            // clocked window with nobody in it and false of a watched moment,
            // and only the fn knows which this is.
            else: { component: 'Text', props: { color: 'faint' }, children: '$.previewHint' },
          },
        ],
      },
    },
  ],
};
