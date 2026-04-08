import type { LayoutStory } from '../../story-types';

export const structureConditionalInLoopStory: LayoutStory = {
  id: 'structure-conditional-in-loop',
  name: 'Conditional in loop',
  description:
    'Demonstrates per-item conditionals inside a loop. Each iteration binds `$item` and uses both an inline `{$if, $then, $else}` directive on the Box `background` prop and a sibling `if/then/else` Text node — so enabled items turn green with a check, disabled items turn red with a cross.',
  kind: 'layout',
  category: 'Structure',
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 8, padding: 24 },
    children: [
      {
        for: '$.items',
        as: 'item',
        do: {
          component: 'Box',
          props: {
            padding: 12,
            radius: 6,
            background: {
              $if: '$item.enabled',
              $then: '#dcfce7',
              $else: '#fee2e2',
            },
          },
          children: {
            component: 'Stack',
            props: { direction: 'row', gap: 12, align: 'center' },
            children: [
              {
                component: 'Text',
                props: { weight: 'bold' },
                children: '{{$item.name}}',
              },
              {
                if: '$item.enabled',
                then: {
                  component: 'Text',
                  props: { size: 'sm' },
                  children: '\u2713 enabled',
                },
                else: {
                  component: 'Text',
                  props: { size: 'sm' },
                  children: '\u2717 disabled',
                },
              },
            ],
          },
        },
      },
    ],
  },
  data: {
    items: [
      { name: 'Item A', enabled: true },
      { name: 'Item B', enabled: false },
      { name: 'Item C', enabled: true },
    ],
  },
  expected: {
    textIncludes: [
      'Item A',
      'Item B',
      'Item C',
      '\u2713 enabled',
      '\u2717 disabled',
    ],
  },
};
