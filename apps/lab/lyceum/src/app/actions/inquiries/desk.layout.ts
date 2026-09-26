import type { LayoutNode } from '@niscorp/nova';

export const deskLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick'], rows: ['auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'live' }, children: [{ component: 'Label', children: 'Inquiries · put a question to the records' }] },
    // One whole-cell action per question — each carries its fingerprint.
    {
      for: '$.questions',
      as: 'q',
      do: { component: 'Action', ref: 'question', props: { label: '{{$q.question}}', value: '$q.fingerprint' } },
    },
    {
      component: 'Cell',
      props: { pad: 'none' },
      children: [
        { if: '$.error', then: { component: 'Text', children: '{{$.error}}' } },
        {
          if: '$.asked',
          then: {
            component: 'Rows',
            props: { rows: '$.answer', rowKey: 'label', empty: 'Nothing on record.', columns: [{ label: 'Answer', key: 'label', w: 2 }, { label: '', key: 'value', kind: 'mono', w: 1 }] },
          },
          else: { component: 'Cell', props: { mark: 'hatch' }, children: [{ component: 'Text', children: 'Pick a question.' }] },
        },
      ],
    },
  ],
};
