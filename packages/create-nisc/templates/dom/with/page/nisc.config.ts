import { JSDOM } from 'jsdom';
import type { NiscShellProject } from '@niscorp/cli';
import { boot } from './src/boot';
import { adopt, draw } from './src/ui/screen';

export const project: NiscShellProject = {
  shell: async () => ({ shell: boot() }),
  draw: (shell) => draw(shell, new JSDOM('').window),
  adopt,
};
