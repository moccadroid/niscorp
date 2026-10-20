import type { ShellManifest } from '@niscorp/moss';
import { ANSWERS } from '../answers';
import { ARRANGEMENTS } from '../arrangements';
import { SCREENS } from '../screens';
import { AREAS } from './areas';
import { frameLayout } from './frame.layout';

// The app opens on the first screen: its prepared answers, an area each, in its arrangement.
const first = SCREENS[0];
const opening = (first?.answers ?? []).flatMap((id) => ANSWERS.filter((answer) => answer.id === id));
const arranged = ARRANGEMENTS.find((arrangement) => arrangement.id === first?.arrangement) ?? ARRANGEMENTS[0];

export const shell: ShellManifest = {
  canvases: [
    { id: 'bar', initial: 'answer.bar' },
    ...AREAS.map((area, at) => {
      const answer = opening[at];
      return answer === undefined ? { id: area } : { id: area, initial: { action: answer.action, input: answer.input } };
    }),
    { id: 'line', initial: 'ask.line' },
  ],
  layout: frameLayout,
  layoutStore: arranged === undefined ? {} : { answers: arranged.layout },
};
