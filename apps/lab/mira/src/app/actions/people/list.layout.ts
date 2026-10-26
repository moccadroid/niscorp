import type { LayoutNode } from '@niscorp/nova';

export const listLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'People' },
  children: [
    {
      for: '$.rows',
      as: 'person',
      key: 'id',
      do: {
        component: 'Row',
        children: [
          { component: 'Text', props: { tone: 'strong' }, children: '{{$person.email}}' },
          { if: '$person.name', then: { component: 'Text', children: '{{$person.name}}' } },
          { component: 'Text', props: { tone: 'muted' }, children: '{{$person.role}}' },
        ],
      },
    },
    { component: 'Text', props: { tone: 'lead' }, children: 'Invite somebody: they sign in with a link mailed to this address.' },
    {
      component: 'Row',
      children: [
        { component: 'Input', ref: 'email', model: '$.email', props: { placeholder: 'their@address.com' } },
        { component: 'Input', ref: 'name', model: '$.name', props: { placeholder: 'Their name' } },
        { component: 'Button', ref: 'invite', props: { label: { $if: '$.inviting', $then: 'Inviting…', $else: 'Invite' } } },
      ],
    },
    { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
  ],
};
