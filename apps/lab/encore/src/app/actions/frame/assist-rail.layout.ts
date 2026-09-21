import type { LayoutNode } from '@niscorp/nova';

// Thin on purpose. Three entries show, each exactly one line; the rest are one
// more line saying how many. So the rail can never push the room down by more
// than a line per entry, and never by more than six.
const SHOWN = 3;

export const assistRailLayout: LayoutNode = {
  if: '$.entries.length',
  then: {
    component: 'Row',
    props: { gap: 12, align: 'start' },
    children: [
      {
        component: 'Stack',
        props: { grow: true, gap: 2 },
        children: [
          // A cold reader should not have to work out what this list is.
          { component: 'Text', props: { value: 'Earlier', variant: 'label', tone: 'mute' } },
          // Who answered is x-ray's business; an operator reads what was said. The
          // rows are projected per mode, so the role is not even SENT with x-ray off.
          {
            component: 'Rail',
            ref: 'entry',
            props: {
              rows: { $if: '$.xray', $then: '$.entries', $else: { $prism: { $map: { over: { $ref: '$.entries' }, as: 'row', body: { $omit: { from: { $var: 'row' }, keys: ['by'] } } } } } },
              rowKey: 'key',
              tagKey: { $if: '$.xray', $then: 'by', $else: '' },
              toneKey: 'tone',
              primaryKey: 'line',
              secondaryKey: 'said',
              detailKey: 'full',
              open: '$.open',
              max: { $if: { $eq: ['$.open', '__all__'] }, $then: 999, $else: SHOWN },
            },
          },
        ],
      },
      // The only thing that ever ends a thread, and it is a person's click.
      { component: 'Button', ref: 'newThread', props: { label: 'new thread', variant: 'quiet' } },
    ],
  },
  else: '',
};
