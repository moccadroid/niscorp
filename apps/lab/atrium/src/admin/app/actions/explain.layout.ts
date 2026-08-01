import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice } from './panel';

export const explainLayout: LayoutNode = panel(
  'Explain',
  'Pick a principal and a stay state — every slot, and which link in the chain broke',
  split(
    // ── left: who, and in what state ──
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        errorNotice,
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Principal' },
        {
          component: 'Stack',
          props: { gap: 6 },
          children: {
            for: '$.explain.principals',
            as: 'p',
            key: 'id',
            do: { component: 'Tile', ref: 'pick', props: { title: '$p.name', blurb: '$p.who', icon: '$p.icon', active: '$p.active', value: '$p' } },
          },
        },
        { component: 'Rule', props: {} },
        {
          component: 'Stack',
          props: { gap: 6 },
          children: [
            { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Stay state — asked, not read. No real stay is touched.' },
            {
              component: 'Row',
              props: { gap: 5, wrap: true },
              children: {
                for: '$.explain.states',
                as: 's',
                key: 'value',
                do: {
                  component: 'Button',
                  ref: 'state',
                  props: { variant: { $if: '$s.active', $then: 'solid', $else: 'quiet' }, value: '$s.value' },
                  children: '$s.label',
                },
              },
            },
          ],
        },
        {
          component: 'Box',
          props: { px: 12, py: 10, bg: 'sunk', radius: 10 },
          children: {
            component: 'Stack',
            props: { gap: 3 },
            children: [
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'The chain, in the order the app applies it:' },
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'audience → charter → resolver → stay state' },
            ],
          },
        },
      ],
    },

    // ── right: every slot, and where it stopped ──
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        {
          component: 'Row',
          props: { justify: 'between', align: 'center', gap: 10, wrap: true },
          children: [
            {
              component: 'Stack',
              props: { gap: 2 },
              children: [
                { component: 'Text', props: { serif: true, size: 'xl' }, children: '{{$.explain.subject.name}} — what is placed, and what is not' },
                { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.explain.subject.detail' },
              ],
            },
            { component: 'Badge', props: { tone: 'accent' }, children: '{{$.explain.placed}} of {{$.explain.total}} placed' },
          ],
        },
        {
          if: '$.loading',
          then: { component: 'Skeleton', props: { h: 40, count: 8 } },
          else: {
            component: 'Stack',
            props: { gap: 8 },
            children: {
              for: '$.explain.slots',
              as: 's',
              key: 'id',
              do: {
                component: 'Box',
                props: { px: 12, py: 10, bg: '$s.bg', radius: 10 },
                children: {
                  component: 'Stack',
                  props: { gap: 6 },
                  children: [
                    {
                      component: 'Row',
                      props: { justify: 'between', align: 'start', gap: 12 },
                      children: [
                        {
                          component: 'Stack',
                          props: { gap: 0 },
                          children: [
                            { component: 'Text', props: { size: 'sm', weight: 'medium' }, children: '$s.title' },
                            { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '$s.detail' },
                          ],
                        },
                        { component: 'Badge', props: { tone: '$s.tone' }, children: '$s.verdict' },
                      ],
                    },
                    // The chain itself. Four chips, and the one that is alert is
                    // the answer — everything after it was never asked.
                    {
                      component: 'Row',
                      props: { gap: 5, wrap: true },
                      children: {
                        for: '$s.chain',
                        as: 'link',
                        key: 'factor',
                        do: { component: 'Badge', props: { tone: '$link.tone' }, children: '$link.label' },
                      },
                    },
                    {
                      if: '$s.because',
                      then: { component: 'Text', props: { size: 'xs', color: 'soft' }, children: '$s.because' },
                      else: '',
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    },
  ),
);
