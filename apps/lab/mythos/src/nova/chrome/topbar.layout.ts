import type { LayoutNode } from '@niscorp/nova';

export const topbarLayout: LayoutNode = {
  component: 'Surface',
  props: { mood: '$.stats.mood' },
  children: [
    {
      component: 'Stack',
      props: { direction: 'row', gap: 14, align: 'center', padding: 14, maxWidth: 980 },
      children: [
        {
          component: 'Stack',
          props: { direction: 'row', gap: 8, align: 'center' },
          children: [
            { component: 'Doodle', props: { kind: 'tulip', stage: 'bloom', size: 'sm' } },
            { component: 'Text', props: { size: 'lg', weight: 'bold' }, children: 'mythos' },
          ],
        },
        {
          component: 'Stack',
          props: { direction: 'row', gap: 4 },
          children: [
            { component: 'Button', ref: 'nav-patch', props: { label: 'The Patch', variant: 'ghost', active: '$.onPatch' } },
            { component: 'Button', ref: 'nav-garden', props: { label: 'The Garden', variant: 'ghost', active: '$.onGarden' } },
          ],
        },
        { component: 'Stack', props: { grow: true } },
        {
          component: 'Stack',
          props: { direction: 'row', gap: 10, align: 'center' },
          children: [
            { component: 'Chip', props: { label: 'mood: {{$.stats.mood_label}}', tone: 'accent' } },
            { component: 'Meter', props: { value: '{{$.stats.done_today}}', max: 5, label: '{{$.stats.done_today}} bloomed today' } },
            {
              component: 'Chip',
              props: {
                label: { $if: '$.streak', $then: '🔥 {{$.streak}}-day streak', $else: 'no streak yet' },
                tone: { $if: '$.streak', $then: 'soft', $else: 'ghost' },
              },
            },
            { component: 'Button', ref: 'new-todo', props: { label: '+ Plant a todo', variant: 'primary' } },
          ],
        },
      ],
    },
  ],
};
