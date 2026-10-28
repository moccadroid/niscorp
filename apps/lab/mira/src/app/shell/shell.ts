import type { ShellManifest } from '@niscorp/moss';
import { SCREENS } from '../screens';
import { frameLayout } from './frame.layout';
import { placesOf, screenLayout } from './screen.layout';

const [first] = SCREENS;

// The answer shown is the `screen` canvas: every card on it live at once, in the order the answer gives them, matched by
// key by the app's `keyed` reconciler. Each answer draws its own layout of it; this one is the first screen's. Nobody
// signed in holds none of the first screen, and gets the sign-in there.
export const shell: ShellManifest = {
  canvases: [
    {
      id: 'screen',
      mode: 'list',
      reconcile: 'keyed',
      actionLayout: screenLayout(first.columns, placesOf(first.columns, first.cards.map((card) => ({ span: card.span ?? 1, ink: first.ink }))), 1),
      initial: ['signin.door'],
    },
    { id: 'overview' },
    { id: 'dock', initial: 'ask.dock' },
  ],
  layout: frameLayout,
};
