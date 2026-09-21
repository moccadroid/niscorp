import type { LayoutNode } from '@niscorp/nova';

// Flat rows in, grouped bars out: the primitive is told which key names the
// row a bar sits on and which keys bound it. Minutes-of-day on the axis, so
// `from`/`to` are the festival's programme window (noon to midnight).
export const lineupTimelineLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Running order', subtitle: '{{$.day}}' },
  children: [
    {
      component: 'Timeline',
      props: {
        bars: '$.slots',
        idKey: 'act_id',
        rowKey: 'stage_name',
        labelKey: 'act_name',
        startKey: 'start_min',
        endKey: 'end_min',
        // EXPOSURE: a set on an open-air stage under a weather warning arrives
        // with a tone and the words for why (vex/lineup.entries.ts), and the
        // timeline lights the bar in it. Nothing here knows what weather is.
        toneKey: 'exposure_tone',
        noteKey: 'exposure_display',
        from: 720,
        to: 1440,
        step: 60,
        highlight: '$.highlightActId',
        empty: 'Nothing billed.',
      },
    },
  ],
};
