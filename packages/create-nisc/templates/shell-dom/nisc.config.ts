import { JSDOM } from 'jsdom';
import type { NiscShellProject } from '@niscorp/cli';
import { boot } from './src/boot';
import { adopt, draw } from './src/ui/screen';

// What this app tells the `nisc` command. It has no server: the shell runs in
// the page. So it hands over its own boot (the one src/main.ts runs) and the
// two ends of a drawn screen — drawn to markup at build (in a DOM jsdom
// provides), picked up in the page.
//
//   npm run dev      the app in vite
//   npm run build    bundle, draw every path, and check what was drawn
//   npm run export   …and write each path as a file: the site as a folder
//   npm run check    the checks in src/dev
export const project: NiscShellProject = {
  shell: async () => ({ shell: boot() }),
  draw: (shell) => draw(shell, new JSDOM('').window),
  adopt,
};
