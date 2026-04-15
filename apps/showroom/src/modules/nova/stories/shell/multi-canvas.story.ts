import * as demo from './multi-canvas.demo';
import source from './multi-canvas.demo?raw';

export const story = {
  id: 'multi-canvas',
  name: 'Multi-canvas navigation',
  description:
    'A nav canvas drives a separate content canvas. Each button fires a `replace` with `canvas: "content"`, swapping the article without touching the nav.',
  category: 'Multi-canvas',
  kind: 'shell' as const,
  ...demo,
  source,
};
