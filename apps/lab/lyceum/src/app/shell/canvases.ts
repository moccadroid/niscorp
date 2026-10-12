import type { ShellManifest } from '@niscorp/moss';

// Each canvas mounts the first candidate the principal is granted.
export const CANVASES: ShellManifest['canvases'] = [
  { id: 'strip', initial: ['stage.strip'] },
  { id: 'main', initial: ['speaker.console', 'member.phone', 'kit.sink', 'lectern.signin', 'door.join'] },
  {
    id: 'body',
    mode: 'list',
    actionLayout: {
      if: '$.active',
      then: { for: '$.instances', as: 'instance', do: { component: 'ActionSlot', props: { instanceId: '$instance.id' } } },
      else: { component: 'Sheet', props: { areas: ['none'] }, children: [{ component: 'Cell', props: { area: 'none', mark: 'hatch' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: 'Nothing here yet.' }] }] },
    },
  },
  { id: 'head', initial: ['speaker.head'] },
  {
    // A list: every tool the slide lists is live at once, in order.
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
  { id: 'attached', mode: 'list', actionLayout: { if: '$.active', then: { for: '$.instances', as: 'instance', do: { component: 'ActionSlot', props: { instanceId: '$instance.id' } } } } },
  { id: 'controls', initial: ['speaker.controls'] },
  { id: 'overlay' },
  { id: 'deck', initial: ['stage.deck', 'speaker.deck'] },
];
