import type { LayoutNode } from '@niscorp/nova';

export const companyLayout: LayoutNode = {
  component: 'Box',
  children: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
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
                { component: 'Avatar', props: { name: '$.record.name', size: 'lg' } },
                {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: [
                    { component: 'Text', props: { size: 'lg', weight: 650 }, children: '$.record.name' },
                    { component: 'Text', props: { mono: true, size: 'sm', color: 'dim' }, children: '$.record.domain' },
                  ],
                },
              ],
            },
          },
          { component: 'Button', ref: 'edit', props: { variant: 'default', size: 'sm', icon: 'edit' }, children: 'Edit' },
        ],
      },

      {
        component: 'Row',
        props: { gap: 32 },
        children: [
          {
            component: 'Stack',
            props: { gap: 5 },
            children: [
              { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Industry' },
              { component: 'Row', props: {}, children: { component: 'Badge', props: { tone: 'slate' }, children: '$.record.industry' } },
            ],
          },
          {
            component: 'Stack',
            props: { gap: 5 },
            children: [
              { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Size' },
              { component: 'Text', props: { color: 'secondary' }, children: '$.record.size' },
            ],
          },
        ],
      },

      {
        component: 'Grid',
        props: { weights: [1, 1], gap: 24, align: 'start' },
        children: [
          {
            component: 'Stack',
            props: { gap: 8 },
            children: [
              { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'People · {{$.contacts.length}}' },
              {
                if: '$.contacts.length',
                then: {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: {
                    for: '$.contacts',
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
          {
            component: 'Stack',
            props: { gap: 8 },
            children: [
              { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Open deals · {{$.deals.length}}' },
              {
                if: '$.deals.length',
                then: {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: {
                    for: '$.deals',
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
