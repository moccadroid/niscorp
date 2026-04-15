import { Demo } from './push-pop-navigation.demo';
import source from './push-pop-navigation.demo?raw';

export const story = {
  id: 'push-pop-navigation',
  name: 'Push / pop navigation',
  description:
    'A menu action with three buttons. Each pushes a screen onto the canvas; each screen has a Back button that pops. The canvas stack grows and shrinks as the user navigates.',
  category: 'Navigation',
  kind: 'shell' as const,
  Demo,
  source,
};
