import type { LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// A composite profile card using every primitive — Box, Stack,
// Text, Button, Input. Nothing reactive, just layout composition.

const layout: LayoutNode = {
  component: 'Box',
  props: { padding: 24, background: '#ffffff', radius: 12, border: true },
  children: {
    component: 'Stack',
    props: { direction: 'column', gap: 16 },
    children: [
      {
        component: 'Stack',
        props: { direction: 'row', gap: 16, align: 'center' },
        children: [
          {
            component: 'Box',
            props: { padding: 24, background: '#dbeafe', radius: 999 },
            children: { component: 'Text', props: { weight: 'bold' }, children: 'AL' },
          },
          {
            component: 'Stack',
            props: { direction: 'column', gap: 2 },
            children: [
              {
                component: 'Text',
                props: { size: 'xl', weight: 'bold' },
                children: '{{$.user.name}}',
              },
              {
                component: 'Text',
                props: { size: 'sm', color: '#6b7280' },
                children: '{{$.user.title}}',
              },
            ],
          },
        ],
      },
      { component: 'Text', props: { size: 'md' }, children: '{{$.user.bio}}' },
      {
        component: 'Stack',
        props: { direction: 'row', gap: 8 },
        children: [
          { component: 'Button', props: { variant: 'primary' }, children: 'Follow' },
          { component: 'Button', props: { variant: 'secondary' }, children: 'Message' },
        ],
      },
      { component: 'Input', props: { placeholder: 'Add a note', value: '' } },
    ],
  },
};

const data = {
  user: {
    name: 'Ada Lovelace',
    title: 'Mathematician',
    bio: 'Pioneer of computing.',
  },
};

export { layout, data };

export const Demo = () => <Nova.Layout layout={layout} data={data} />;
