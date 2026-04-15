import * as demo from './dashboard-shell.demo';
import source from './dashboard-shell.demo?raw';

export const story = {
  id: 'dashboard-shell',
  name: 'Dashboard — nested shell layout',
  description:
    'A nested `canvasLayout`: topbar row over a body with two boxed panels. Each topbar click both `replace`s the metrics widget and `push`es an event onto a list-mode activity canvas.',
  category: 'Layouts',
  kind: 'shell' as const,
  ...demo,
  source,
};
