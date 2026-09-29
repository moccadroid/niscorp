import type { LayoutNode } from '@niscorp/nova';

// A notification: its words, over the controller, in the sheet's chrome.
export const notificationLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['text'] },
  children: [{ component: 'Cell', props: { area: 'text', ink: 'alert' }, children: [{ component: 'Headline', props: { level: 'name' }, children: '{{$.text}}' }] }],
};
