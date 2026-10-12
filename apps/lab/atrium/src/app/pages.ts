import type { PageManifest } from '@niscorp/moss';

export const PAGES: Record<string, PageManifest> = {
  about: {
    path: '/about',
    layout: {
      component: 'Stack',
      children: [
        { component: 'CanvasSlot', props: { canvasId: 'who' } },
        { component: 'CanvasSlot', props: { canvasId: 'main' } },
      ],
    },
    canvases: [
      { id: 'who', initial: ['about.who'] },
      { id: 'main', initial: ['about.page'] },
    ],
  },
};
