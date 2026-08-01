import type { LayoutNode } from '@niscorp/nova';

export const opsIntegrationsLayout: LayoutNode = {
  component: 'Box',
  props: {},
  children: {
    component: 'Stack',
    props: { gap: 20, maxWidth: 900 },
    children: [
      {
        component: 'Hero',
        props: {
          eyebrow: 'Your house',
          title: 'Integrations',
          subtitle: 'The systems this hotel runs, and the services you offer from each. Flip a switch and every surface — including phones open in the lobby — follows.',
        },
      },

      {
        if: '$.loading',
        then: { component: 'Skeleton', props: { h: 80, count: 2 } },
        else: {
          component: 'Grid',
          props: { min: 260, gap: 12 },
          children: {
            for: '$.integrations',
            as: 'i',
            key: 'connector_id',
            do: {
              component: 'Card',
              props: {},
              children: {
                component: 'Stack',
                props: { gap: 10 },
                children: [
                  {
                    component: 'Row',
                    props: { justify: 'between', align: 'start', gap: 10 },
                    children: [
                      {
                        component: 'Stack',
                        props: { gap: 2 },
                        children: [
                          { component: 'Text', props: { serif: true, size: 'lg' }, children: '$i.name' },
                          { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$i.vendor' },
                        ],
                      },
                      { component: 'Badge', props: { tone: 'neutral' }, children: '$i.kind' },
                    ],
                  },
                  { component: 'Button', ref: 'pick', props: { variant: 'quiet', value: '$i' }, children: 'Services' },
                ],
              },
            },
          },
        },
      },

      // ── the services of the opened integration ────────────
      {
        if: '$.selected.connector_id',
        then: {
          component: 'Card',
          props: {},
          children: {
            component: 'Stack',
            props: { gap: 14 },
            children: [
              { component: 'Text', props: { serif: true, size: 'xl' }, children: '{{$.selected.name}} — services' },
              {
                component: 'Text',
                props: { size: 'sm', color: 'mute' },
                children: 'What you offer your guests and staff from this system. Grey rows are not in the integration’s current offer — ask us, not the switch.',
              },
              {
                component: 'Stack',
                props: { gap: 4 },
                children: {
                  for: '$.services',
                  as: 's',
                  key: 'row_id',
                  do: {
                    component: 'Row',
                    props: { justify: 'between', align: 'center', gap: 12 },
                    children: [
                      {
                        component: 'Stack',
                        props: { gap: 0 },
                        children: [
                          { component: 'Text', props: { size: 'sm', weight: 'medium', color: { $if: '$s.provided', $then: 'ink', $else: 'faint' } }, children: '$s.label' },
                          {
                            component: 'Text',
                            props: { size: 'xs', color: 'faint' },
                            children: { if: '$s.provided', then: '$s.blurb', else: 'Not in the offer right now — the integration has it switched off.' },
                          },
                        ],
                      },
                      {
                        if: '$s.provided',
                        then: {
                          if: '$s.offered',
                          then: { component: 'Switch', ref: 'offer-off', props: { on: true, value: '$s' } },
                          else: { component: 'Switch', ref: 'offer-on', props: { on: false, value: '$s' } },
                        },
                        else: { component: 'Badge', props: { tone: 'neutral' }, children: 'unavailable' },
                      },
                    ],
                  },
                },
              },
              { if: '$.working', then: { component: 'Row', props: { gap: 8, align: 'center' }, children: [{ component: 'Spinner', props: {} }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Re-resolving your surfaces…' }] }, else: '' },
            ],
          },
        },
        else: '',
      },
    ],
  },
};
