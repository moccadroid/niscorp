import type { ShellManifest } from '@niscorp/moss';

// Each canvas mounts the first candidate the principal is granted — nobody
// configures who sees what; the charter decides by existence (rule 11).
//
//   strip  the projector's strip over every slide (stage)
//   badge  your department (only the assigned are granted it)
//   main   the controller (speaker), your ID card (members), the door (anyone
//          else); the stage's slides are put here by its deck
//   head, tools, notes, controls
//          the controller's four regions (speaker). They are not in the frame:
//          the controller's own layout places them (speaker/console.layout.ts),
//          so they exist on the speaker's screen and nowhere else. `tools` is
//          the slide's tool, put there by the speaker's deck.
//   desk   your department's own tool — the one thing your clearance lets you
//          do that the others' does not
//   overlay  whatever is opened over the screen, in the `sheet` fragment's
//          chrome (all slides, on the controller)
//   deck   the stage's and the speaker's deck: shows nothing, follows the
//          `deck` row. Not in the frame.
export const CANVASES: ShellManifest['canvases'] = [
  { id: 'strip', initial: ['stage.strip'] },
  { id: 'badge', initial: ['department.badge'] },
  { id: 'main', initial: ['speaker.console', 'member.card', 'kit.sink', 'door.join'] },
  { id: 'head', initial: ['speaker.head'] },
  { id: 'tools' },
  { id: 'notes', initial: ['speaker.notes'] },
  { id: 'controls', initial: ['speaker.controls'] },
  { id: 'desk', initial: ['records.register', 'forms.rename', 'inquiries.desk', 'archive.log'] },
  { id: 'overlay' },
  { id: 'deck', initial: ['stage.deck', 'speaker.deck'] },
];
