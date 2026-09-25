import type { ShellManifest } from '@niscorp/moss';

// Each canvas mounts the first candidate the principal holds — the door for
// the anonymous, the controller for the speaker, the roster for the stage, the
// member card for everybody in the room. Nobody configures which; the charter
// decides by existence (rule 11).
//
// `house` holds one candidate that only the sorted hold, so for everybody
// else it is simply empty.
export const CANVASES: ShellManifest['canvases'] = [
  { id: 'main', initial: ['speaker.console', 'stage.roster', 'member.card', 'door.join'] },
  { id: 'house', initial: ['house.crest'] },
];
