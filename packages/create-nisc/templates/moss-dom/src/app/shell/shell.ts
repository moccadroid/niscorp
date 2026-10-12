import type { ShellManifest } from '@niscorp/moss';
import { frameLayout } from './frame.layout';

export const shell: ShellManifest = {
  canvases: [{ id: 'main', initial: 'welcome' }],
  layout: frameLayout,
};
