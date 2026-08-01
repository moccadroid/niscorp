import type { LayoutNode } from '@niscorp/nova';

export const connectorsLayout: LayoutNode = {
  component: 'Box',
  props: { py: 24, px: 20 },
  children: {
    component: 'Stack',
    props: { gap: 24, maxWidth: 1100 },
    children: [
      // ── the pull, on its own ─────────────────────────────
      // Discovery is a first-class operation, not a side effect of flipping a
      // switch: this asks every connector's service for its bundle and runs
      // it through intake. It is also the way back when the app booted with a
      // service down — there are no switches to stage until a pull lands one.
      {
        component: 'Row',
        props: { justify: 'between', align: 'center', gap: 12, wrap: true },
        children: [
          {
            component: 'Text',
            props: { size: 'sm', color: 'mute' },
            children: 'Everything below arrived over the wire. The app ships with no knowledge of any of these vendors.',
          },
          // Labelled by what it will actually do: with a connector open the
          // pull is scoped to it, otherwise it walks the estate.
          {
            component: 'Button',
            ref: 'sync',
            props: { variant: 'quiet', icon: 'plug', disabled: '$.working' },
            children: {
              if: '$.working',
              then: 'Pulling…',
              else: { if: '$.selected.connector_id', then: 'Pull {{$.selected.name}}', else: 'Pull all bundles' },
            },
          },
        ],
      },

      // What the last pull said, per connector — landed, or the reasons
      // intake refused it. A refusal changes nothing on disk, so this list is
      // the only place it is visible, and it names the reason.
      {
        if: '$.sync.length',
        then: {
          component: 'Stack',
          props: { gap: 6 },
          children: [
            { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Pulled from the integrations service:' },
            {
              for: '$.sync',
              as: 's',
              key: 'connector',
              do: {
                if: '$s.ok',
                then: {
                  component: 'Row',
                  props: { gap: 8, align: 'center' },
                  children: [
                    { component: 'Badge', props: { tone: 'good' }, children: '$s.connector' },
                    { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '$s.detail' },
                  ],
                },
                else: {
                  component: 'Notice',
                  props: { tone: 'warn', icon: 'alert', title: '{{$s.connector}} — refused, nothing changed' },
                  children: '$s.detail',
                },
              },
            },
          ],
        },
        else: '',
      },

      {
        component: 'Grid',
        props: { min: 300, gap: 12 },
        children: {
          for: '$.rows',
          as: 'c',
          key: 'connector_id',
          do: {
            component: 'Card',
            props: {},
            children: {
              component: 'Stack',
              props: { gap: 12 },
              children: [
                {
                  component: 'Row',
                  props: { justify: 'between', align: 'start', gap: 10 },
                  children: [
                    {
                      component: 'Stack',
                      props: { gap: 2 },
                      children: [
                        { component: 'Text', props: { serif: true, size: 'lg' }, children: '$c.name' },
                        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$c.vendor' },
                      ],
                    },
                    { component: 'Badge', props: { tone: 'neutral' }, children: 'build v{{$c.live_version}}' },
                  ],
                },
                { component: 'Text', props: { size: 'sm', color: 'soft' }, children: '$c.notes' },
                { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '$c.service_url' },
                { component: 'Button', ref: 'pick', props: { variant: 'quiet', value: '$c' }, children: 'Open' },
              ],
            },
          },
        },
      },

      // ── the offer, when a connector is open ───────────────
      {
        if: '$.selected.connector_id',
        then: {
          component: 'Card',
          props: {},
          children: {
            component: 'Stack',
            props: { gap: 18 },
            children: [
              { component: 'Text', props: { serif: true, size: 'xl' }, children: '{{$.selected.name}} — the offer' },
              {
                component: 'Text',
                props: { size: 'sm', color: 'mute' },
                children: 'Switches stage in the connector row. Nothing a hotel or a guest holds moves until you go live.',
              },

              {
                component: 'Stack',
                props: { gap: 4 },
                children: {
                  for: '$.offer',
                  as: 'k',
                  key: 'row_id',
                  do: {
                    component: 'Row',
                    props: { justify: 'between', align: 'center', gap: 12 },
                    children: [
                      {
                        component: 'Stack',
                        props: { gap: 0 },
                        children: [
                          { component: 'Text', props: { size: 'sm', weight: 'medium' }, children: '$k.label' },
                          { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '{{$k.blurb}} · arrived in v{{$k.version}}' },
                        ],
                      },
                      {
                        if: '$k.enabled',
                        then: { component: 'Switch', ref: 'stage-off', props: { on: true, value: '$k' } },
                        else: { component: 'Switch', ref: 'stage-on', props: { on: false, value: '$k' } },
                      },
                    ],
                  },
                },
              },

              { component: 'Rule', props: {} },

              {
                component: 'Row',
                props: { justify: 'between', align: 'center', gap: 12, wrap: true },
                children: [
                  {
                    component: 'Stack',
                    props: { gap: 2 },
                    children: [
                      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Goes to every property on this connector:' },
                      {
                        component: 'Row',
                        props: { gap: 6, wrap: true },
                        children: {
                          for: '$.reach',
                          as: 'p',
                          key: 'property_id',
                          do: { component: 'Badge', props: { tone: 'neutral' }, children: '{{$p.name}} · {{$p.city}}' },
                        },
                      },
                    ],
                  },
                  {
                    component: 'Button',
                    ref: 'golive',
                    props: { icon: 'arrow', disabled: { $if: '$.dirty', $then: '$.working', $else: true } },
                    children: { if: '$.working', then: 'Going live…', else: 'Go live' },
                  },
                ],
              },

              {
                if: '$.shipped',
                then: {
                  component: 'Notice',
                  props: { tone: 'good', icon: 'check', title: 'Live' },
                  children: 'Every property on this connector re-resolved and every open shell adopted the change in place. Nothing was deployed and nothing restarted.',
                },
                else: {
                  if: '$.dirty',
                  then: { component: 'Notice', props: { tone: 'accent', icon: 'plug' }, children: 'Staged — the offer rows changed, the world has not. Go live applies them.' },
                  else: '',
                },
              },

            ],
          },
        },
        else: '',
      },
    ],
  },
};
