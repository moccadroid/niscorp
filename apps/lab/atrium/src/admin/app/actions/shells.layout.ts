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
            { component: 'Stat', props: { label: 'Unattended', value: '$.shells.health.idle' } },
            { component: 'Stat', props: { label: 'Uptime', value: '$.shells.health.uptime' } },
          ],
        },
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Shells the server is holding' },
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
              { label: '', w: 1, cell: { kind: 'chip', key: 'attached', toneKey: 'tone' } },
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
                component: 'Row',
                props: { justify: 'between', align: 'start', gap: 12 },
                children: [
                  {
                    component: 'Stack',
                    props: { gap: 2 },
                    children: [
                      { component: 'Text', props: { serif: true, size: 'xl' }, children: '$.selected.name' },
                      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.selected.id}} · {{$.selected.who}}' },
                      { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '{{$.selected.attached}} · {{$.selected.age}}' },
                    ],
                  },
                  // THE RESTART. Two presses, because it is the one control in
                  // this tool that lands on a person: the first arms it and
                  // says what it costs, the second does it. Nothing here is
                  // undoable by pressing it again, so the guard is about
                  // reaching it by accident while reading a roster.
                  {
                    if: '$.arming',
                    then: {
                      component: 'Row',
                      props: { gap: 6, align: 'center' },
                      children: [
                        {
                          component: 'Button',
                          ref: 'restart',
                          props: { variant: 'quiet', icon: 'arrow', disabled: '$.working', value: '$.selected' },
                          children: { if: '$.working', then: 'Restarting…', else: 'Yes, restart it' },
                        },
                        { component: 'Button', ref: 'cancel', props: { variant: 'plain' }, children: 'Cancel' },
                      ],
                    },
                    else: { component: 'Button', ref: 'arm', props: { variant: 'plain', icon: 'arrow' }, children: 'Restart this shell' },
                  },
                ],
              },
              {
                if: '$.arming',
                then: {
                  component: 'Notice',
                  props: { tone: 'warn', icon: 'alert', title: 'This ends what they are doing' },
                  children: 'Their terminals stay connected and stay signed in — they land back on the screen they get at login. Anything they had navigated into is gone.',
                },
                else: '',
              },
              {
                if: '$.done',
                then: { component: 'Notice', props: { tone: 'good', icon: 'check', title: 'Restarted' }, children: 'A fresh shell was built and their terminals were served it.' },
                else: '',
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
          else: nothingChosen('Pick a shell to see what is mounted on each of its canvases — and to restart it.'),
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
