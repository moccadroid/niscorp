import type { ShellManifest } from '@niscorp/moss';

// Each canvas mounts the first candidate the principal is granted — nobody
// configures who sees what; the charter decides by existence (rule 11).
//
//   strip  the projector's strip over every slide (stage)
//   main   the controller (speaker), the phone (members), the speaker's
//          sign-in desk (a device at /speaker), the door (anyone else); the
//          stage's slides are put here by its deck
//   head, tools, notes, controls
//          the controller's four regions (speaker). They are not in the frame:
//          the controller's own layout places them (speaker/console.layout.ts),
//          so they exist on the speaker's screen and nowhere else. `tools` is
//          the slide's tools, a list the speaker's deck reconciles.
//   body   the phone's list (members), placed by the phone's own layout
//          (member/phone.layout.ts): every action the person holds that
//          belongs on a phone, one under another (server/phone.ts)
//   overlay  whatever is opened over the screen, in the `sheet` fragment's
//          chrome (all slides, on the controller)
//   deck   the stage's and the speaker's deck: shows nothing, follows the
//          `deck` row. Not in the frame.
export const CANVASES: ShellManifest['canvases'] = [
  { id: 'strip', initial: ['stage.strip'] },
  { id: 'main', initial: ['speaker.console', 'member.phone', 'kit.sink', 'lectern.signin', 'door.join'] },
  // The phone's three regions (member/phone.layout.ts) — not in the frame.
  // A LIST: the middle of the phone — the actions it holds, one under another
  // (member/phone.action.ts reconciles it: the assistant, installed
  // integrations, the X-ray once given).
  { id: 'body', mode: 'list', actionLayout: { for: '$.instances', as: 'instance', do: { component: 'ActionSlot', props: { instanceId: '$instance.id' } } } },
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
];
