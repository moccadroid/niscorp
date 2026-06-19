import type { LayoutNode } from '@niscorp/nova';

// The company profile panel — wider than a contact (min(560px, 46vw)), so it
// uses a two-column body: People | Open deals. Loads by id: `loadCompany` fills
// `$.view` with { record, contacts, deals }. People and deals are LinkRows —
// click one to open that contact/deal in this same panel (cross-linking by id).
export const companyDetailLayout: LayoutNode = {
  component: 'Box',
  props: { width: 'min(560px, 46vw)', h: '100%', scroll: true, border: 'left' },
  children: {
    component: 'Stack',
    props: { pad: 24, gap: 22 },
    children: [
      // ── Header ──
      {
        component: 'Row',
        props: { justify: 'between', align: 'start' },
        children: [
          {
            if: '$.loading',
            then: {
              component: 'Row',
              props: { gap: 12 },
              children: [
                { component: 'Skeleton', props: { width: 44, height: 44 } },
                { component: 'Stack', props: { gap: 6 }, children: [{ component: 'Skeleton', props: { width: 150, height: 15 } }, { component: 'Skeleton', props: { width: 100, height: 12 } }] },
              ],
            },
            else: {
              component: 'Row',
              props: { gap: 12 },
              children: [
                { component: 'Avatar', props: { name: '$.view.record.name', size: 'lg' } },
                {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: [
                    { component: 'Text', props: { size: 'lg', weight: 650 }, children: '$.view.record.name' },
                    { component: 'Text', props: { mono: true, size: 'sm', color: 'dim' }, children: '$.view.record.domain' },
                  ],
                },
              ],
            },
          },
          {
            component: 'Row',
            props: { gap: 6, align: 'center' },
            children: [
              { component: 'Button', ref: 'edit', props: { variant: 'default', size: 'sm', icon: 'edit' }, children: 'Edit' },
              { component: 'Button', ref: 'close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
            ],
          },
        ],
      },

      // ── Info row ──
      {
        component: 'Row',
        props: { gap: 32 },
        children: [
          {
            component: 'Stack',
            props: { gap: 5 },
            children: [
              { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Industry' },
              { component: 'Row', props: {}, children: { component: 'Badge', props: { tone: 'slate' }, children: '$.view.record.industry' } },
            ],
          },
          {
            component: 'Stack',
            props: { gap: 5 },
            children: [
              { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Size' },
              { component: 'Text', props: { color: 'secondary' }, children: '$.view.record.size' },
            ],
          },
        ],
      },

      // ── Two columns: People | Open deals ──
      {
        component: 'Grid',
        props: { template: '1fr 1fr', gap: 24, align: 'start' },
        children: [
          // People
          {
            component: 'Stack',
            props: { gap: 8 },
            children: [
              { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'People · {{$.view.contacts.length}}' },
              {
                if: '$.view.contacts.length',
                then: {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: {
                    for: '$.view.contacts',
                    as: 'c',
                    key: 'contact_id',
                    do: {
                      component: 'LinkRow',
                      ref: 'open-contact',
                      props: { value: '$.c.contact_id' },
                      children: {
                        component: 'Row',
                        props: { gap: 9 },
                        children: [
                          { component: 'Avatar', props: { name: '$.c.name', size: 'sm' } },
                          {
                            component: 'Stack',
                            props: { gap: 0 },
                            children: [
                              { component: 'Text', props: { size: 'sm', weight: 500 }, children: '$.c.name' },
                              { component: 'Text', props: { size: 'xs', color: 'dim' }, children: '$.c.title' },
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
                else: { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'No people' },
              },
            ],
          },
          // Open deals
          {
            component: 'Stack',
            props: { gap: 8 },
            children: [
              { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Open deals · {{$.view.deals.length}}' },
              {
                if: '$.view.deals.length',
                then: {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: {
                    for: '$.view.deals',
                    as: 'd',
                    key: 'deal_id',
                    do: {
                      component: 'LinkRow',
                      ref: 'open-deal',
                      props: { value: '$.d.deal_id' },
                      children: {
                        component: 'Stack',
                        props: { gap: 5 },
                        children: [
                          { component: 'Text', props: { size: 'sm', weight: 500 }, children: '$.d.title' },
                          {
                            component: 'Row',
                            props: { gap: 8 },
                            children: [
                              { component: 'Badge', props: { tone: 'blue' }, children: '$.d.stage' },
                              { component: 'Text', props: { size: 'sm', weight: 600 }, children: '$.d.value_display' },
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
                else: { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'No open deals' },
              },
            ],
          },
        ],
      },
    ],
  },
};
