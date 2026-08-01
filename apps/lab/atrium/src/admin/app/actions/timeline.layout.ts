import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice } from './panel';

export const timelineLayout: LayoutNode = panel(
  'Timeline',
  'Every endpoint the living shells called — names and timings, never payloads',
  split(
    // ── left: whose calls, and how they went ──
    {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        errorNotice,
        {
          component: 'Grid',
          props: { min: 130, gap: 10 },
          children: [
            { component: 'Stat', props: { label: 'Calls held', value: '$.timeline.figures.count', hint: 'the last 300' } },
            { component: 'Stat', props: { label: 'Slowest', value: '$.timeline.figures.slowest' } },
          ],
        },
        { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Filter by principal' },
        {
          component: 'Stack',
          props: { gap: 6 },
          children: {
            for: '$.timeline.principals',
            as: 'p',
            key: 'id',
            do: { component: 'Tile', ref: 'pick', props: { title: '$p.name', blurb: '$p.detail', icon: 'chat', active: '$p.active', value: '$p' } },
          },
        },
        {
          component: 'Box',
          props: { px: 12, py: 10, bg: 'sunk', radius: 10 },
          children: {
            component: 'Text',
            props: { size: 'xs', color: 'faint' },
            children: 'Which endpoint, from which action, how long, and whether it worked. Not what was asked and not what came back — the seam keeps no field that could hold either.',
          },
        },
      ],
    },

    // ── right: the feed ──
    {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        {
          component: 'Row',
          props: { justify: 'between', align: 'center', gap: 10 },
          children: [
            { component: 'Text', props: { serif: true, size: 'xl' }, children: '$.timeline.subject' },
            { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Newest first. Refresh to re-read.' },
          ],
        },
        {
          component: 'Rows',
          props: {
            rows: '$.timeline.calls',
            rowKey: 'id',
            loading: '$.loading',
            dense: true,
            empty: 'Nothing has been called yet. Use the app in the other tab and refresh.',
            columns: [
              { label: 'Endpoint', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'from' } },
              { label: 'Who', w: 1, cell: { kind: 'text', key: 'who' } },
              { label: 'When', w: 1, cell: { kind: 'text', key: 'ago' } },
              { label: '', w: 1, cell: { kind: 'chip', key: 'outcome', toneKey: 'tone' } },
            ],
          },
        },
      ],
    },
  ),
);
