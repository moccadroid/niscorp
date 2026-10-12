import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { NiscShellProject } from '@niscorp/cli';
import { boot } from './src/boot';
import { Screen, adopt } from './src/ui/screen';

export const project: NiscShellProject = {
  shell: async () => ({ shell: boot() }),
  draw: (shell) => renderToString(createElement(Screen, { shell })),
  adopt,
};
