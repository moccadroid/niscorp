import type { LayoutNode, Step } from '@niscorp/nova';

// Things to ask, as buttons: pressing one asks it, as if it had been typed.
export const examplesLayout: LayoutNode = {
  component: 'Row',
  children: [{ for: '$.examples', as: 'example', do: { component: 'Button', ref: 'example', props: { label: '$example', tone: 'quiet', value: '$example' } } }],
};

export const askExample: Step[] = [{ emit: { channel: 'ask', payload: '@event.payload' } }];
