import type { ShellManifest } from '@niscorp/moss';
import { frameLayout } from './frame.layout';

// The shell: one canvas, the action it opens with, and the frame around it.
// Shells host canvases, canvases host action instances, actions render JSON
// layouts.
export const shell: ShellManifest = {
  canvases: [{ id: 'main', initial: 'welcome' }],
  layout: frameLayout,
};
