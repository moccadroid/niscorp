import type { ShellManifest } from '@niscorp/moss';

// Each canvas mounts the first candidate the principal holds — the door for
// the anonymous, the controller for the speaker, the roster for the stage, the
// member card for everybody in the room. Nobody configures which; the charter
// decides by existence (rule 11).
//
// `house` holds one candidate that only the sorted hold, so for everybody
// else it is simply empty.
//
// The stage's `main` has no candidate of its own: `deck` holds the stage's
// deck, which puts the slide the `deck` row names there — so a restart lands
// the projector on the slide it left.
export const CANVASES: ShellManifest['canvases'] = [
  { id: 'strip', initial: ['stage.strip'] },
  { id: 'main', initial: ['speaker.console', 'member.card', 'kit.sink', 'door.join'] },
  { id: 'house', initial: ['house.crest'] },
  { id: 'deck', initial: ['stage.deck'] },
];
