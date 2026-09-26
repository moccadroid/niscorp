import type { ActionDefinition } from '@niscorp/nova';
import { consoleLayout } from './console.layout';

// The speaker's controller. It shows nothing of its own: its layout is the
// arrangement of four canvases (./console.layout.ts), and each holds an action
// that knows its one job — the head (speaker.head), the slide's tool (put on
// `tools` by the speaker's deck), the slide's notes (speaker.notes), and Back,
// Next and All slides (speaker.controls). Only the speaker is granted it, so the
// arrangement exists only on the speaker's screen; every other screen keeps the
// frame's plain stack.
export const consoleAction: ActionDefinition = {
  id: 'speaker.console',
  title: 'Controller',
  data: {},
  layout: consoleLayout,
  triggers: [],
};
