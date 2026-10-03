import type { CanvasConfig, LayoutNode } from '@niscorp/nova';
import { frameLayout } from './frame.layout';

// The shell, as data: one canvas, the action it opens with, and the frame
// around it. Shells host canvases, canvases host action instances, actions
// render JSON layouts. src/boot.ts builds the shell from this.
export const shell: { canvases: CanvasConfig[]; canvasLayout: LayoutNode } = {
  canvases: [{ id: 'main', initial: 'welcome' }],
  canvasLayout: frameLayout,
};
