import type { CanvasConfig, LayoutNode } from '@niscorp/nova';
import { frameLayout } from './frame.layout';

export const shell: { canvases: CanvasConfig[]; canvasLayout: LayoutNode } = {
  canvases: [{ id: 'main', initial: 'welcome' }],
  canvasLayout: frameLayout,
};
