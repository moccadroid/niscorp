import type { PageManifest } from '@niscorp/moss';

// PAGES — what is drawn at a path and kept by nothing (moss, app.ts § pages).
// The app itself is `/`; these stand beside it.
//
// The data half only: which canvases, what mounts on them, how they are
// arranged. A page's per-principal boot input is derived in app.ts, with the
// rest of the manifest's code.
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
      // A candidate nobody but a signed-in person is granted: for a stranger
      // the canvas is empty and takes no room.
      { id: 'who', initial: ['about.who'] },
      { id: 'main', initial: ['about.page'] },
    ],
  },
};
