import type { ShellManifest } from '@niscorp/moss';
import type { LayoutNode } from '@niscorp/nova';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';

// THE ROOM'S REGIONS. Every one is a `list` canvas — a tray, not a deck — so
// two cards on `doing` are two live forms side by side, and a card arriving
// never suspends its neighbour. `line` is the exception: one instance, forever.
//
// A region draws its own heading and draws NOTHING when it is empty: moss
// serves a canvas with no visible content as `[]`, and the arrangement
// collapses it. An empty room is an empty screen with a cursor in it, which is
// the correct thing to show somebody who has not said anything yet.

// (The region's question used to be drawn here, over every card. It is x-ray's
// now: app/shell/calm.layout.ts.)
const region = (_heading: string): LayoutNode => ({
  if: '$.instances.length',
  then: {
    component: 'Stack',
    props: { gap: 10 },
    children: [
      { for: '$.instances', as: 'card', key: 'id', do: { component: 'ActionSlot', props: { instanceId: '$.card.id' } } },
    ],
  },
  else: '',
});

// Furniture trays: no heading, because what sits on them is chrome and says so
// itself.
const tray: LayoutNode = { for: '$.instances', as: 'card', key: 'id', do: { component: 'ActionSlot', props: { instanceId: '$.card.id' } } };

const HEADINGS: Record<(typeof QUESTION_CANVASES)[number], string> = {
  doing: 'what are you doing?',
  about: 'who or what is this about?',
  where: 'where is it?',
  when: 'when is it?',
  nearby: 'what else matters?',
};

export const CANVASES: ShellManifest['canvases'] = [
  { id: 'line', initial: 'intent.line' },
  ...QUESTION_CANVASES.map((id) => ({ id, mode: 'list' as const, actionLayout: region(HEADINGS[id]) })),
  // The slow path's one card. Empty until a pass decides a handoff is coming.
  { id: 'assist', mode: 'list', actionLayout: tray },
  // The log of the shift: always there, under the exchange, outliving it.
  { id: 'rail', mode: 'list', actionLayout: tray, initial: 'assist.rail' },
  { id: 'maybe', mode: 'list', actionLayout: tray, initial: 'intent.options' },
  // THE ROOM WATCHES (scene 4). `watch` is the strip that says so; `attention`
  // is where a card goes up with nobody typing — written by event passes and by
  // nothing else, as the five question canvases are written by sentences and by
  // nothing else. `deck` is the director's controls.
  { id: 'watch', mode: 'list', actionLayout: tray, initial: 'attention.strip' },
  { id: 'attention', mode: 'list', actionLayout: tray },
  { id: 'deck', mode: 'list', actionLayout: tray, initial: 'director.deck' },
  // Declared and deliberately absent from every arrangement: a later slice
  // mounts speculative cards here so their reads are warm before promotion.
  // It costs nothing now and spares the frame a migration then.
  { id: 'warm', mode: 'list', actionLayout: tray },
  { id: 'trace', mode: 'list', actionLayout: tray, initial: 'intent.trace' },
  // The one switch between the app and its instruments.
  { id: 'xray', mode: 'list', actionLayout: tray, initial: 'room.xray' },
];
