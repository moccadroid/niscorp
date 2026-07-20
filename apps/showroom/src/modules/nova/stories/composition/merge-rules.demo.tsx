import { createShell, type ActionDefinition, type ActionFragment } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// MERGE RULES. Composition isn't just layout — `data` and `triggers` merge too.
//   data:     { ...fragment, ...action }  → the action wins on conflict.
//   triggers: [ ...fragment, ...action ]  → both fire on the one instance.
// Here the fragment supplies a default title + a ★ Star behaviour; the action
// overrides the title and adds its own 👍 Like. The merged instance shows the
// action's title (override) and BOTH buttons work (concat).

const favoritable: ActionFragment = {
  kind: 'fragment',
  id: 'favoritable',
  // Fragment defaults: a title (the action will override) and a star count.
  data: { title: 'Untitled', stars: 0 },
  layout: {
    component: 'Box',
    props: { border: true, radius: 10 },
    children: {
      component: 'Stack',
      props: { direction: 'column' },
      children: [
        {
          component: 'Box',
          props: { padding: 12, background: '#fffbeb' },
          children: {
            component: 'Stack',
            props: { direction: 'row', justify: 'between', align: 'center' },
            children: [
              { component: 'Text', props: { weight: 'bold' }, children: '{{$.title}}' },
              { component: 'Button', ref: 'star', props: { variant: 'ghost' }, children: '★ Star ({{$.stars}})' },
            ],
          },
        },
        { component: 'Box', props: { padding: 14 }, children: { slot: 'body' } },
      ],
    },
  },
  // Fragment behaviour: the star.
  triggers: [{ event: 'ui:click', ref: 'star', do: [{ increment: 'stars' }] }],
};

const article: ActionDefinition = {
  id: 'article',
  // `title` overrides the fragment's 'Untitled'; `stars` is left to the
  // fragment's default (0); `likes` is the action's own.
  data: { title: 'Composition over inheritance', likes: 0 },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 10 },
    children: [
      {
        component: 'Text',
        props: { color: '#475569', size: 'sm' },
        children: 'The body is the action’s. Its title above won, replacing the fragment’s default “Untitled”.',
      },
      { component: 'Button', ref: 'like', props: { variant: 'primary' }, children: '👍 Like ({{$.likes}})' },
    ],
  },
  // Action behaviour: the like. It fires alongside the fragment's star.
  triggers: [{ event: 'ui:click', ref: 'like', do: [{ increment: 'likes' }] }],
};

const shell = createShell({
  canvases: [{ id: 'stage', initial: { action: 'article', with: ['favoritable'] } }],
  actions: { article },
  fragments: { favoritable },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
