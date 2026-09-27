import type { ShellManifest } from '@niscorp/moss';

// Each canvas mounts the first candidate the principal is granted — nobody
// configures who sees what; the charter decides by existence (rule 11).
//
//   strip  the projector's strip over every slide (stage)
//   main   the controller (speaker), the phone (members), the door (anyone
//          else); the stage's slides are put here by its deck
//   head, tools, notes, controls
//          the controller's four regions (speaker). They are not in the frame:
//          the controller's own layout places them (speaker/console.layout.ts),
//          so they exist on the speaker's screen and nowhere else. `tools` is
//          the slide's tools, a list the speaker's deck reconciles.
//   self, body, tabs
//          the phone's three regions (members), placed by the phone's own
//          layout (member/phone.layout.ts): your card as one line; one thing
//          at a time; a tab for each thing you hold — a list the phone
//          reconciles, so the charter decides the tabs by existence
//   overlay  whatever is opened over the screen, in the `sheet` fragment's
//          chrome (all slides, on the controller)
//   look   the room's look (room/look.action.ts): a marker, on every screen
//          whose principal holds it; the terminal paints with the kit it names
//   deck   the stage's and the speaker's deck: shows nothing, follows the
//          `deck` row. Not in the frame.
export const CANVASES: ShellManifest['canvases'] = [
  { id: 'strip', initial: ['stage.strip'] },
  { id: 'main', initial: ['speaker.console', 'member.phone', 'kit.sink', 'door.join'] },
  // The phone's three regions (member/phone.layout.ts) — not in the frame.
  { id: 'self', initial: [{ action: 'member.card', input: { strip: true } }] },
  { id: 'body', initial: ['member.card'] },
  // A LIST: one tab per thing this person holds, placed by the phone's reconcile.
  { id: 'tabs', mode: 'list', actionLayout: { for: '$.instances', as: 'instance', do: { component: 'ActionSlot', props: { instanceId: '$instance.id' } } } },
  { id: 'head', initial: ['speaker.head'] },
  {
    // A LIST: every tool the slide lists is live at once, stacked in order
    // (the speaker's deck reconciles it). A slide with none says so.
    id: 'tools',
    mode: 'list',
    actionLayout: {
      if: '$.active',
      then: { for: '$.instances', as: 'instance', do: { component: 'ActionSlot', props: { instanceId: '$instance.id' } } },
      else: {
        component: 'Sheet',
        props: { size: 'fill', areas: ['none'] },
        children: [{ component: 'Cell', props: { area: 'none', mark: 'hatch', align: 'center' }, children: [{ component: 'Label', children: 'Nothing to press on this slide' }] }],
      },
    },
  },
  { id: 'notes', initial: ['speaker.notes'] },
  { id: 'controls', initial: ['speaker.controls'] },
  { id: 'overlay' },
  { id: 'deck', initial: ['stage.deck', 'speaker.deck'] },
  { id: 'look', initial: ['room.look'] },
];
