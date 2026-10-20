import type { ShellManifest } from '@niscorp/moss';
import { frameLayout } from './frame.layout';

export const shell: ShellManifest = {
  canvases: [{ id: 'bar', initial: 'answer.bar' }, { id: 'a', initial: 'answer.home' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'line', initial: 'ask.line' }],
  layout: frameLayout,
};
