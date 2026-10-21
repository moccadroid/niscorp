import type { LayoutNode } from '@niscorp/nova';

export const examplesLayout: LayoutNode = {
  component: 'Row',
  children: [{ for: '$.examples', as: 'example', do: { component: 'Button', ref: 'example', props: { label: '$example', tone: 'quiet', value: '$example' } } }],
};
