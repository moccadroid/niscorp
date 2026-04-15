import { Demo } from './conditional-detail.demo';
import source from './conditional-detail.demo?raw';

export const story = {
  id: 'conditional-detail',
  name: 'Conditional detail pane',
  description:
    'The shell `canvasLayout` wraps the detail CanvasSlot in an `if` on `$.canvases.1.active`. When the detail canvas is empty the entire right panel disappears — a real layout change, not a CSS toggle.',
  category: 'Layouts',
  kind: 'shell' as const,
  Demo,
  source,
};
