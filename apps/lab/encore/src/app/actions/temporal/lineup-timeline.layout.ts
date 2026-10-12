import type { LayoutNode } from '@niscorp/nova';

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
