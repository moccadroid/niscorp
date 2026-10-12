import type { LayoutNode } from '@niscorp/nova';

export const notificationLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['text'] },
  children: [{ component: 'Cell', props: { area: 'text', ink: 'alert' }, children: [{ component: 'Headline', props: { level: 'name' }, children: '{{$.text}}' }] }],
};
