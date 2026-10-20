import type { ShellManifest } from '@niscorp/moss';
import { ANSWERS } from '../answers';
import { SCREENS } from '../screens';
import { AREAS } from './areas';
import { frameLayout } from './frame.layout';

// The app opens on the first screen: its prepared answers, an area each.
const opening = (SCREENS[0]?.answers ?? []).flatMap((id) => ANSWERS.filter((answer) => answer.id === id));

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
};
