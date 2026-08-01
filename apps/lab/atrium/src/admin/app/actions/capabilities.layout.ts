import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice } from './panel';

export const capabilitiesLayout: LayoutNode = panel(
  'Capabilities',
  'What each connector offers, what each property took, and the discovery pull',
  split(
    // ── left: the connectors, and the pull ──
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        errorNotice,
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Connectors' },
        {
          component: 'Stack',
          props: { gap: 6 },
          children: {
            for: '$.capabilities.connectors',
            as: 'c',
            key: 'id',
            do: { component: 'Tile', ref: 'pick', props: { title: '$c.name', blurb: '$c.detail', icon: 'plug', active: '$c.active', value: '$c' } },
          },
        },
        {
          component: 'Button',
          ref: 'pull',
          props: { variant: 'quiet', icon: 'plug', disabled: '$.working', big: true },
          children: { if: '$.working', then: 'Pulling…', else: 'Pull {{$.capabilities.connector.name}}' },
        },
        {
          if: '$.sync.length',
          then: {
            component: 'Stack',
            props: { gap: 6 },
            children: {
              for: '$.sync',
              as: 'r',
              key: 'connector',
              do: {
                if: '$r.ok',
                then: {
                  component: 'Row',
                  props: { gap: 8, align: 'center' },
                  children: [
                    { component: 'Badge', props: { tone: 'good' }, children: '$r.connector' },
                    { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '$r.detail' },
                  ],
                },
                else: { component: 'Notice', props: { tone: 'warn', icon: 'alert', title: '{{$r.connector}} — refused, nothing changed' }, children: '$r.detail' },
              },
            },
          },
          else: '',
        },
      ],
    },

    // ── right: the offer, then what each property took ──
    {
      component: 'Stack',
      props: { gap: 18 },
      children: [
        {
          component: 'Stack',
          props: { gap: 2 },
          children: [
            { component: 'Text', props: { serif: true, size: 'xl' }, children: '{{$.capabilities.connector.name}} — the offer' },
            { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Switching one off withdraws it from every property on this connector. {{$.capabilities.connector.service}}' },
          ],
        },
        {
          if: '$.loading',
          then: { component: 'Skeleton', props: { h: 30, count: 6 } },
          else: {
            component: 'Stack',
            props: { gap: 2 },
            children: {
              for: '$.capabilities.offers',
              as: 'o',
              key: 'capability_id',
              do: {
                component: 'Row',
                props: { justify: 'between', align: 'center', gap: 12 },
                children: [
                  {
                    component: 'Stack',
                    props: { gap: 0 },
                    children: [
                      { component: 'Text', props: { size: 'sm' }, children: '$o.label' },
                      { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '$o.detail' },
                    ],
                  },
                  { component: 'Switch', ref: 'flip', props: { on: '$o.enabled', value: '$o' } },
                ],
              },
            },
          },
        },

        { component: 'Rule', props: {} },

        {
          component: 'Stack',
          props: { gap: 2 },
          children: [
            { component: 'Text', props: { size: 'sm', weight: 'medium' }, children: 'Property enablement' },
            { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'The manager owns these. Enabling something no connector provides is allowed, and simply stays dark.' },
          ],
        },
        {
          component: 'Stack',
          props: { gap: 2 },
          children: {
            for: '$.capabilities.properties',
            as: 'e',
            key: 'label',
            do: {
              component: 'Row',
              props: { justify: 'between', align: 'center', gap: 12 },
              children: [
                { component: 'Text', props: { size: 'sm', color: 'soft' }, children: '$e.label' },
                { component: 'Switch', ref: 'flip', props: { on: '$e.enabled', value: '$e' } },
              ],
            },
          },
        },
      ],
    },
  ),
);
