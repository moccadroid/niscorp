import type { LayoutNode } from '@niscorp/nova';

// The crew half of minibar.post: a guest mentions the two waters at checkout
// and the desk puts them on the folio.
//
// No guest picker (the surface arrives with a stay) and no charge on tap —
// choose the item, then post it. The desk half obeys the same rule as the
// guest's own honesty bar, because a mis-tap costs the same either side.
export const postMinibarLayout: LayoutNode = {
  if: '$.stayId',
  then: {
    component: 'Stack',
    props: { gap: 12 },
    children: [
      { if: '$.posted', then: { component: 'Notice', props: { tone: 'good', icon: 'check' }, children: 'Posted {{$.lastItem.label}} — {{$.lastItem.amount_display}} for {{$.stayLabel}}.' }, else: '' },
      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'On {{$.stayLabel}}’s folio.' },
      {
        component: 'Grid',
        props: { min: 132, gap: 8 },
        children: {
          for: '$.items',
          as: 'i',
          key: 'option_id',
          do: {
            component: 'Tile',
            ref: 'pick-item',
            props: { title: '$i.label', blurb: '$i.amount_display', icon: '$i.icon', value: '$i', active: { $if: { $eq: ['$i.option_id', '$.chosen.option_id'] }, $then: true, $else: false } },
          },
        },
      },
      {
        if: '$.chosen.option_id',
        then: {
          component: 'Button',
          ref: 'post',
          props: { big: true, icon: 'receipt', disabled: '$.working' },
          children: { if: '$.working', then: 'Posting…', else: 'Post {{$.chosen.label}} · {{$.chosen.amount_display}}' },
        },
        else: '',
      },
    ],
  },
  else: { component: 'Empty', props: { icon: 'receipt', title: 'No guest in hand', hint: 'Open a guest and this posts to their folio.' } },
};
