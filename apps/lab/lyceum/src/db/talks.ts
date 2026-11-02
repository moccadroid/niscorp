import { SLIDES } from './deck';
import { NOVA_SLIDES } from './nova.deck';

// THE TALKS THIS ROOM CAN GIVE — data, and nothing else. Each is a deck of its
// own (./deck.ts, ./nova.deck.ts); db/seed.ts writes them all, and the deck row
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
];
