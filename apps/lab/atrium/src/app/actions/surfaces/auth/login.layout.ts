import type { LayoutNode } from '@niscorp/nova';

export const loginLayout: LayoutNode = {
  component: 'Box',
  props: { py: 56, px: 20 },
  children: {
    component: 'Stack',
    props: { gap: 32, maxWidth: 780 },
    children: [
      {
        component: 'Hero',
        props: {
          eyebrow: 'Atrium',
          title: 'One deployment. Two hotels. Two property management systems.',
          subtitle: 'Pick who you are. The application you get is not a filtered version of the same screen — it is a different set of actions, resolved from what the integration behind that property can actually do.',
        },
      },
      {
        component: 'Grid',
        props: { min: 320, gap: 12 },
        children: {
          for: '$.people',
          as: 'p',
          key: 'id',
          do: {
            component: 'Tile',
            ref: 'pick',
            props: { title: '$p.name', blurb: '$p.blurb', icon: '$p.icon', value: '$p.username' },
          },
        },
      },
      {
        if: '$.error',
        then: { component: 'Notice', props: { tone: 'alert', icon: 'alert', title: 'That did not work' }, children: '$.error.message' },
        else: '',
      },
      {
        component: 'Text',
        props: { size: 'sm', color: 'faint' },
        children: 'Nothing on this page is a permission flag. Each of these principals holds a different set of action ids, and each property resolves a different set of live capabilities.',
      },
    ],
  },
};
