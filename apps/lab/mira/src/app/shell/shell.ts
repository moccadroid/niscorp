import type { ShellManifest } from '@niscorp/moss';
import { ARRANGEMENTS } from '../arrangements';
import { SCREENS } from '../screens';
import { AREAS } from './areas';
import { frameLayout } from './frame.layout';

const [first] = SCREENS;
const arranged = ARRANGEMENTS.find((arrangement) => arrangement.id === first.arrangement) ?? ARRANGEMENTS[0];

export const shell: ShellManifest = {
  canvases: [
    ...AREAS.map((area, at) => {
      const canvas = first.canvases[at];
      return canvas === undefined ? { id: area } : { id: area, initial: { action: canvas.action, input: canvas.input } };
    }),
    { id: 'dock', initial: 'ask.dock' },
  ],
  layout: frameLayout,
  layoutStore: arranged === undefined ? {} : { answers: arranged.layout },
};
