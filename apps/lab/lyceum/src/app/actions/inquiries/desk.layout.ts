import type { LayoutNode } from '@niscorp/nova';

export const deskLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick'], rows: ['auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'live' }, children: [{ component: 'Label', children: 'Inquiries · stored queries' }] },
    // One whole-cell action per stored query — each carries its fingerprint.
    {
      for: '$.queries',
      as: 'q',
      do: { component: 'Action', ref: 'query', props: { label: '{{$q.label}}', value: '$q.fingerprint' } },
    },
    {
      component: 'Cell',
      props: { pad: 'none' },
      children: [
        { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        {
          if: '$.chosen',
          then: {
            component: 'Rows',
            props: { rows: '$.result', rowKey: 'label', empty: 'Nothing on record.', columns: [{ label: 'Result', key: 'label', w: 2 }, { label: '', key: 'value', kind: 'mono', w: 1 }] },
          },
          else: { component: 'Cell', props: { mark: 'hatch' }, children: [{ component: 'Text', children: 'Pick a query.' }] },
        },
      ],
    },
  ],
};
