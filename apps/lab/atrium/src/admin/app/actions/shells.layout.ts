import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice, nothingChosen } from './panel';

export const shellsLayout: LayoutNode = panel(
  'Shells',
  'Living server shells, what is mounted on each canvas, and the process behind them',
  split(
    // ── left: who holds a shell ──
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        errorNotice,
        {
          component: 'Grid',
          props: { min: 130, gap: 10 },
          children: [
            { component: 'Stat', props: { label: 'Living shells', value: '$.shells.health.shells' } },
            { component: 'Stat', props: { label: 'Uptime', value: '$.shells.health.uptime' } },
          ],
        },
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Connected right now' },
        {
          component: 'Rows',
          props: {
            rows: '$.shells.sessions',
            rowKey: 'id',
            rowRef: 'pick',
            loading: '$.loading',
            dense: true,
            empty: 'Nobody is signed in.',
            columns: [
              { label: 'Principal', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'who' } },
              { label: '', w: 1, cell: { kind: 'chip', key: 'mounted', toneKey: 'tone' } },
            ],
          },
        },
        {
          component: 'Box',
          props: { px: 12, py: 10, bg: 'sunk', radius: 10 },
          children: {
            component: 'Text',
            props: { size: 'xs', color: 'faint' },
            children: 'Principal, audience and the action ids on their canvases. Not what they typed and not what they read — the seam has no route that could answer those.',
          },
        },
      ],
    },

    // ── right: one shell's canvases, and the process figures ──
    {
      component: 'Stack',
      props: { gap: 18 },
      children: [
        {
          if: '$.selected.id',
          then: {
            component: 'Stack',
            props: { gap: 12 },
            children: [
              {
                component: 'Stack',
                props: { gap: 2 },
                children: [
                  { component: 'Text', props: { serif: true, size: 'xl' }, children: '$.selected.name' },
                  { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.selected.id}} · {{$.selected.who}}' },
                ],
              },
              {
                component: 'Stack',
                props: { gap: 8 },
                children: {
                  for: '$.selected.stacks',
                  as: 'c',
                  key: 'id',
                  do: {
                    component: 'Row',
                    props: { justify: 'between', align: 'start', gap: 12 },
                    children: [
                      { component: 'Badge', props: { tone: 'neutral' }, children: '$c.id' },
                      { component: 'Text', props: { size: 'sm', color: 'soft' }, children: '$c.trail' },
                    ],
                  },
                },
              },
            ],
          },
          else: nothingChosen('Pick a shell to see what is mounted on each of its canvases.'),
        },

        { component: 'Rule', props: {} },

        {
          component: 'Grid',
          props: { min: 200, gap: 10 },
          children: [
            { component: 'Stat', props: { label: 'Actions served', value: '$.shells.health.actions' } },
            { component: 'Stat', props: { label: 'Cache entries', value: '$.shells.health.entries' } },
            { component: 'Stat', props: { label: 'Last pull', value: '$.shells.health.sync' } },
          ],
        },
      ],
    },
  ),
);
