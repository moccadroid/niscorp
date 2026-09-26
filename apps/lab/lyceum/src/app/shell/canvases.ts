import type { ShellManifest } from '@niscorp/moss';

// Each canvas mounts the first candidate the principal is granted — nobody
// configures who sees what; the charter decides by existence (rule 11).
//
//   strip  the projector's strip over every slide (stage)
//   badge  your department (only the assigned are granted it)
//   main   the controller (speaker), your ID card (members), the door (anyone
//          else); the stage's slides are put here by its deck
//   tools  what the controller needs for the slide on screen (speaker; put
//          here by the speaker's deck)
//   desk   your department's own tool — the one thing your clearance lets you
//          do that the others' does not
//   deck   the stage's and the speaker's deck: shows nothing, follows the
//          `deck` row. Not in the frame.
export const CANVASES: ShellManifest['canvases'] = [
  { id: 'strip', initial: ['stage.strip'] },
  { id: 'badge', initial: ['department.badge'] },
  { id: 'main', initial: ['speaker.console', 'member.card', 'kit.sink', 'door.join'] },
  { id: 'tools' },
  { id: 'desk', initial: ['records.register', 'forms.rename', 'inquiries.desk', 'archive.log'] },
  { id: 'deck', initial: ['stage.deck', 'speaker.deck'] },
];
