import type { LayoutNode } from '@niscorp/nova';

export const staffChromeLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 0 },
  children: [
    { component: 'Theme', props: { tokens: '$.themeTokens', name: '$.themeName' } },

    {
      component: 'Drawer',
      props: { open: '$.menuOpen' },
      ref: 'closeMenu',
      children: {
        component: 'Stack',
        props: { gap: 0 },
        children: [
          {
            component: 'DrawerHeader',
            props: { name: '$.personName', role: '$.roleLabel', studio: '$.studioName' },
          },

          {
            component: 'DrawerLink',
            props: { label: '$.home.label', value: '$.home.action', current: '$.currentArea', icon: 'home' },
            ref: 'nav',
          },

          {
            for: '$.areas',
            as: 'area',
            key: 'action',
            do: {
              component: 'DrawerLink',
              // Lights by the AREA, opens its FIRST SCREEN — see `Tab` for why
              // those are two props rather than one.
              props: { label: '$.area.label', value: '$.area.areaId', payload: '$.area.action', current: '$.currentArea', icon: '$.area.icon' },
              ref: 'nav',
            },
          },
          { component: 'DrawerFooter', props: { label: 'Sign out' }, ref: 'leave' },
        ],
      },
    },

    // ── the thumb bar ────────────────────────────────────────
    {
      component: 'Bar',
      props: { position: 'bottom' },
      children: [
        {
          for: '$.primaryAreas',
          as: 'area',
          key: 'action',
          do: { component: 'Tab', props: { label: '$.area.label', value: '$.area.areaId', payload: '$.area.action', current: '$.currentArea', icon: '$.area.icon' }, ref: 'nav' },
        },
        { component: 'Tab', props: { label: 'More', value: '$.moreValue', current: '$.currentArea', icon: 'more' }, ref: 'openMenu' },
      ],
    },

    // ── the bell ─────────────────────────────────────────────
    //
    // Only exists while something is unread, which is also what keeps it off
    // rungs that cannot read the table (their count call is refused and the
    // number stays 0). Pushed live: the shell hears 'notified' over its own
    // socket and this strip appears with no navigation and no reload.
    {
      if: '$.unseen',
      then: {
        component: 'Box',
        props: { border: 'bottom' },
        children: {
          component: 'Box',
          props: { px: 24, maxWidth: 1040, center: true },
          children: {
            component: 'Row',
            props: { justify: 'between', align: 'center', gap: 12 },
            children: [
              {
                component: 'Row',
                props: { gap: 8, align: 'center' },
                children: [
                  { component: 'Icon', props: { name: 'inbox' } },
                  { component: 'Text', props: { size: 'sm', weight: 'semi' }, children: 'The studio has {{$.unseen}} unread notice(s).' },
                ],
              },
              { component: 'Button', props: { variant: 'ghost', label: 'Read them' }, ref: 'bell' },
            ],
          },
        },
      },
      else: '',
    },

    // ── the second level, in the content ─────────────────────
    {
      if: '$.tabCount',
      then: {
        // The hairline runs full width and the tabs sit on the measure, so the
        // rule reads as the edge of the chrome rather than a box around them.
        component: 'Box',
        props: { border: 'bottom' },
        children: {
          component: 'Box',
          props: { px: 24, maxWidth: 1040, center: true },
          children: { component: 'Tabs', props: { value: '$.currentLeaf', options: '$.tabs', look: 'underline' }, ref: 'navLeaf' },
        },
      },
      else: '',
    },
  ],
};
