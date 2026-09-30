import type { LayoutNode } from '@niscorp/nova';

// The button: the whole width of the phone, blue, one word.
export const xrayButtonLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['open'] },
  children: [{ component: 'Action', ref: 'open', props: { area: 'open', ink: 'signal', size: 'large', label: 'X-ray' } }],
};

// Every action on the screen, one after the other: where it is, what it is,
// and its data as it stands. Look again after tapping around.
export const xrayViewLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['again'] },
  children: [
    { component: 'Action', ref: 'again', props: { area: 'again', ink: 'ink', label: 'Look again' } },
    {
      for: '$.screen',
      as: 'instance',
      do: {
        component: 'Cell',
        children: [
          { component: 'Label', children: '{{$instance.canvas}} · {{$instance.action}}' },
          { component: 'Code', props: { text: '$instance.data' } },
        ],
      },
    },
  ],
};
