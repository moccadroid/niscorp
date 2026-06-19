import type { ActionDefinition } from '@niscorp/nova';

// A stand-in screen for nav targets whose real screen isn't built yet.
export const placeholderAction: ActionDefinition = {
  id: 'placeholder',
  data: {},
  layout: {
    component: 'Box',
    props: { bg: 'surface', border: true, radius: 13, pad: 48 },
    children: {
      component: 'Row',
      props: { gap: 10, justify: 'center' },
      children: [
        { component: 'Icon', props: { name: 'inbox', size: 20 } },
        { component: 'Text', props: { color: 'mute' }, children: 'Coming soon' },
      ],
    },
  },
};
