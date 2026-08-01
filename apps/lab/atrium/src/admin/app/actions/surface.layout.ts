import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice } from './panel';

export const surfaceLayout: LayoutNode = panel(
  'Surface',
  'Every slot × every property, live or dark, and the reason the resolver gave',
  split(
    // ── left: which property we are looking through ──
    // The resolution is per property, so there is no "all" view to offer: the
    // same slot is live at one and dark at the next, and that IS the subject.
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        errorNotice,
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Properties' },
        {
          component: 'Stack',
          props: { gap: 6 },
          children: {
            for: '$.surface.properties',
            as: 'p',
            key: 'id',
            do: {
              component: 'Tile',
              ref: 'pick',
              props: { title: '$p.name', blurb: '{{$p.city}} · {{$p.connector}}', icon: 'bed', active: '$p.active', value: '$p' },
            },
          },
        },
        {
          component: 'Box',
          props: { px: 12, py: 10, bg: 'sunk', radius: 10 },
          children: {
            component: 'Stack',
            props: { gap: 4 },
            children: [
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'The badge is the resolver’s verdict, per property.' },
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'The switch is ours, and it applies to every property at once.' },
            ],
          },
        },
      ],
    },

    // ── right: the slots, with verdict and switch ──
    {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        { component: 'Text', props: { serif: true, size: 'xl' }, children: '{{$.surface.property.name}} — the resolved surface' },
        {
          if: '$.loading',
          then: { component: 'Skeleton', props: { h: 34, count: 8 } },
          else: {
            component: 'Stack',
            props: { gap: 2 },
            children: {
              for: '$.surface.slots',
              as: 's',
              key: 'id',
              do: {
                component: 'Row',
                props: { justify: 'between', align: 'center', gap: 12 },
                children: [
                  {
                    component: 'Stack',
                    props: { gap: 0 },
                    children: [
                      { component: 'Text', props: { size: 'sm', weight: 'medium' }, children: '$s.title' },
                      { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '{{$s.detail}} · shipped by {{$s.source}}' },
                    ],
                  },
                  {
                    component: 'Row',
                    props: { gap: 10, align: 'center' },
                    children: [
                      { component: 'Badge', props: { tone: '$s.tone' }, children: '$s.state' },
                      { component: 'Switch', ref: 'flip', props: { on: '$s.enabled', value: '$s' } },
                    ],
                  },
                ],
              },
            },
          },
        },
      ],
    },
  ),
);
