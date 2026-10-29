import { SLIDES } from './deck';
import { VEX_SLIDES } from './vex.deck';
import { NOVA_SLIDES } from './nova.deck';
import { CHARTER_SLIDES } from './charter.deck';
import { TIDE_SLIDES } from './tide.deck';
import { STRATA_SLIDES } from './strata.deck';
import { SOLID_SLIDES } from './solid.deck';

// THE TALKS THIS ROOM CAN GIVE — data, and nothing else. Each is a deck of its
// own (./deck.ts, ./vex.deck.ts); db/seed.ts writes them all, and the deck row
// says which one is on. The controller loads one from its Talks sheet
// (app/actions/speaker/talks.action.ts).

// One slide of a talk: the action that IS the slide, the tools the controller
// shows beside it, the speaker's notes, and how many parts it is shown in.
export type Slide = { slideId: string; title: string; tools: readonly string[]; notes: readonly string[]; parts?: number };

export type Talk = { talkId: string; title: string; slides: readonly Slide[] };

// In order. The first is the talk a fresh room opens on.
export const TALKS: readonly Talk[] = [
  { talkId: 'nisc', title: 'nisc — Apps as checked JSON', slides: SLIDES },
  { talkId: 'nova', title: 'Nova — The screen is a document', slides: NOVA_SLIDES },
  { talkId: 'charter', title: 'Charter — What you’re not given doesn’t exist', slides: CHARTER_SLIDES },
  { talkId: 'vex', title: 'Vex — Six tools and no SQL', slides: VEX_SLIDES },
  { talkId: 'tide', title: 'Tide — Automation without an agent loop', slides: TIDE_SLIDES },
  { talkId: 'strata', title: 'Strata — Your stored screens outlive your components', slides: STRATA_SLIDES },
  { talkId: 'solid', title: 'Solid — Draw it while it’s written', slides: SOLID_SLIDES },
];
