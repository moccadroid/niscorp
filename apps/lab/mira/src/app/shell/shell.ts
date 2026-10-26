import type { ShellManifest } from '@niscorp/moss';
import { ARRANGEMENTS } from '../arrangements';
import { SCREENS } from '../screens';
import { AREAS } from './areas';
import { frameLayout } from './frame.layout';

const [first] = SCREENS;
const arranged = ARRANGEMENTS.find((arrangement) => arrangement.id === first.arrangement) ?? ARRANGEMENTS[0];

// Somebody signed in opens on the first screen. Nobody signed in holds none of it, and the first area gets the sign-in.
export const shell: ShellManifest = {
  canvases: [
    ...AREAS.map((area, at) => {
      const canvas = first.canvases[at];
      const opens = canvas === undefined ? [] : [{ action: canvas.action, input: canvas.input }];
      const candidates = at === 0 ? [...opens, 'signin.door'] : opens;
      return candidates.length === 0 ? { id: area } : { id: area, initial: candidates };
    }),
    { id: 'dock', initial: 'ask.dock' },
  ],
  layout: frameLayout,
  layoutStore: arranged === undefined ? {} : { answers: arranged.layout },
};
