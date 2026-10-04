import type { NovaExample } from './example.types';

// Shells: canvases, what stands on them, and how actions move between them.
export const SHELL_EXAMPLES: readonly NovaExample[] = [
  {
    id: 'push-pop',
    group: 'shells',
    title: 'Push and pop',
    description: 'A canvas is a stack. `push` puts an action on top of it and `pop` takes the top one off again, so Back is real: the screen underneath was never gone.',
    shell: {
      canvases: [{ id: 'push-pop.main', initial: 'push-pop.menu' }],
      actions: {
        'push-pop.menu': {
          id: 'push-pop.menu',
          layout: {
            component: 'Stack',
            children: [
              { component: 'Text', children: 'Box office' },
              { component: 'Button', ref: 'seats', children: 'Seats' },
              { component: 'Button', ref: 'prices', children: 'Prices' },
            ],
          },
          triggers: [
            { event: 'ui:click', ref: 'seats', do: [{ push: { action: 'push-pop.seats' } }] },
            { event: 'ui:click', ref: 'prices', do: [{ push: { action: 'push-pop.prices' } }] },
          ],
        },
        'push-pop.seats': {
          id: 'push-pop.seats',
          layout: { component: 'Stack', children: [{ component: 'Text', children: 'Row C is free.' }, { component: 'Button', ref: 'back', children: 'Back' }] },
          triggers: [{ event: 'ui:click', ref: 'back', do: [{ pop: true }] }],
        },
        'push-pop.prices': {
          id: 'push-pop.prices',
          layout: { component: 'Stack', children: [{ component: 'Text', children: 'A seat is 38.' }, { component: 'Button', ref: 'back', children: 'Back' }] },
          triggers: [{ event: 'ui:click', ref: 'back', do: [{ pop: true }] }],
        },
      },
    },
    presses: [{ ref: 'seats' }, { ref: 'back' }, { ref: 'prices' }],
    expected: { says: ['A seat is 38.', 'Back'], stacks: { 'push-pop.main': ['push-pop.menu', 'push-pop.prices'] } },
  },
  {
    id: 'replace',
    group: 'shells',
    title: 'Replace',
    description: '`replace` swaps the action on top for another. The stack does not grow, so a run of steps leaves nothing behind to go back through.',
    shell: {
      canvases: [{ id: 'replace.main', initial: 'replace.seats' }],
      actions: {
        'replace.seats': {
          id: 'replace.seats',
          layout: { component: 'Stack', children: [{ component: 'Text', children: 'Step 1: choose seats' }, { component: 'Button', ref: 'next', children: 'Next' }] },
          triggers: [{ event: 'ui:click', ref: 'next', do: [{ replace: { action: 'replace.payment' } }] }],
        },
        'replace.payment': {
          id: 'replace.payment',
          layout: { component: 'Stack', children: [{ component: 'Text', children: 'Step 2: pay' }, { component: 'Button', ref: 'next', children: 'Next' }] },
          triggers: [{ event: 'ui:click', ref: 'next', do: [{ replace: { action: 'replace.done' } }] }],
        },
        'replace.done': { id: 'replace.done', layout: { component: 'Text', children: 'Step 3: booked' } },
      },
    },
    presses: [{ ref: 'next' }, { ref: 'next' }],
    expected: { says: ['Step 3: booked'], stacks: { 'replace.main': ['replace.done'] } },
  },
  {
    id: 'multi-canvas',
    group: 'shells',
    title: 'Multi-canvas',
    description: 'Two canvases side by side. The one on the left replaces what stands on the other, by naming it: `canvas` on a `replace`. The left one is not touched.',
    shell: {
      canvases: [
        { id: 'multi-canvas.nav', initial: 'multi-canvas.days' },
        { id: 'multi-canvas.content', initial: 'multi-canvas.tonight' },
      ],
      canvasLayout: {
        component: 'Stack',
        children: [
          { component: 'CanvasSlot', props: { canvasId: 'multi-canvas.nav' } },
          { component: 'CanvasSlot', props: { canvasId: 'multi-canvas.content' } },
        ],
      },
      actions: {
        'multi-canvas.days': {
          id: 'multi-canvas.days',
          layout: {
            component: 'Stack',
            children: [
              { component: 'Button', ref: 'tonight', children: 'Tonight' },
              { component: 'Button', ref: 'tomorrow', children: 'Tomorrow' },
            ],
          },
          triggers: [
            { event: 'ui:click', ref: 'tonight', do: [{ replace: { action: 'multi-canvas.tonight', canvas: 'multi-canvas.content' } }] },
            { event: 'ui:click', ref: 'tomorrow', do: [{ replace: { action: 'multi-canvas.tomorrow', canvas: 'multi-canvas.content' } }] },
          ],
        },
        'multi-canvas.tonight': { id: 'multi-canvas.tonight', layout: { component: 'Text', children: 'Tonight: The Tempest' } },
        'multi-canvas.tomorrow': { id: 'multi-canvas.tomorrow', layout: { component: 'Text', children: 'Tomorrow: Twelfth Night' } },
      },
    },
    presses: [{ ref: 'tomorrow' }],
    expected: { says: ['Tonight', 'Tomorrow', 'Tomorrow: Twelfth Night'], stacks: { 'multi-canvas.nav': ['multi-canvas.days'], 'multi-canvas.content': ['multi-canvas.tomorrow'] } },
  },
  {
    id: 'messages',
    group: 'shells',
    title: 'Messages',
    description: 'Actions on different canvases do not reach into each other. One says something on a channel with `emit`; any action with a `message` trigger for that channel hears it.',
    shell: {
      canvases: [
        { id: 'messages.till', initial: 'messages.sell' },
        { id: 'messages.board', initial: 'messages.count' },
      ],
      actions: {
        'messages.sell': {
          id: 'messages.sell',
          layout: { component: 'Button', ref: 'sell', children: 'Sell a seat' },
          triggers: [{ event: 'ui:click', ref: 'sell', do: [{ emit: { channel: 'messages.sold', payload: 1 } }] }],
        },
        'messages.count': {
          id: 'messages.count',
          data: { sold: 0 },
          layout: { component: 'Text', children: 'Sold tonight: {{$.sold}}' },
          triggers: [{ message: 'messages.sold', do: [{ increment: 'sold' }] }],
        },
      },
    },
    presses: [{ ref: 'sell' }, { ref: 'sell' }],
    expected: { says: ['Sell a seat', 'Sold tonight: 2'], stacks: { 'messages.till': ['messages.sell'], 'messages.board': ['messages.count'] } },
  },
  {
    id: 'list-canvas',
    group: 'shells',
    title: 'List canvas',
    description: 'A canvas in `list` mode keeps every action pushed onto it on the screen. Its `actionLayout` loops over `$.instances` and gives each one a slot, so a feed is pushes and nothing else.',
    shell: {
      canvases: [
        { id: 'list-canvas.desk', initial: 'list-canvas.write' },
        {
          id: 'list-canvas.feed',
          mode: 'list',
          actionLayout: { component: 'Stack', children: [{ for: '$.instances', as: 'instance', key: 'id', do: { component: 'ActionSlot', props: { instanceId: '$instance.id' } } }] },
        },
      ],
      actions: {
        'list-canvas.write': {
          id: 'list-canvas.write',
          layout: { component: 'Button', ref: 'note', children: 'Post a note' },
          triggers: [{ event: 'ui:click', ref: 'note', do: [{ push: { action: 'list-canvas.note', canvas: 'list-canvas.feed', input: { text: 'A seat was booked.' } } }] }],
        },
        'list-canvas.note': {
          id: 'list-canvas.note',
          data: { text: '' },
          input: { type: 'object', properties: { text: { type: 'string', description: 'What the note says.' } } },
          layout: { component: 'Text', children: '$.text' },
        },
      },
    },
    presses: [{ ref: 'note' }, { ref: 'note' }],
    expected: { says: ['Post a note', 'A seat was booked.', 'A seat was booked.'], stacks: { 'list-canvas.desk': ['list-canvas.write'], 'list-canvas.feed': ['list-canvas.note', 'list-canvas.note'] } },
  },
  {
    id: 'frame-condition',
    group: 'shells',
    title: 'Frame condition',
    description: 'The layout that arranges the canvases is a layout like any other, over what the canvases hold. Here it draws the second canvas only while something stands on it, and a line in its place while nothing does.',
    shell: {
      canvases: [{ id: 'frame-condition.list', initial: 'frame-condition.shows' }, { id: 'frame-condition.detail' }],
      canvasLayout: {
        component: 'Stack',
        children: [
          { component: 'CanvasSlot', props: { canvasId: 'frame-condition.list' } },
          { if: '$.canvases.1.active', then: { component: 'CanvasSlot', props: { canvasId: 'frame-condition.detail' } }, else: { component: 'Text', children: 'Pick a show.' } },
        ],
      },
      actions: {
        'frame-condition.shows': {
          id: 'frame-condition.shows',
          layout: { component: 'Button', ref: 'open', children: 'The Tempest' },
          triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: 'frame-condition.show', canvas: 'frame-condition.detail' } }] }],
        },
        'frame-condition.show': { id: 'frame-condition.show', layout: { component: 'Text', children: 'Saturday, 19:30. Row C is free.' } },
      },
    },
    presses: [{ ref: 'open' }],
    expected: { says: ['The Tempest', 'Saturday, 19:30. Row C is free.'], stacks: { 'frame-condition.list': ['frame-condition.shows'], 'frame-condition.detail': ['frame-condition.show'] } },
  },
  {
    id: 'hooks',
    group: 'shells',
    title: 'Hooks',
    description: 'An action is told when it is put on a canvas, covered, uncovered and taken off: `mount`, `suspend`, `resume`, `unmount`. Here the first action writes down each one as it happens. Uncovered, it is told `mount` again and then `resume`, so what it loads on mount is never stale.',
    shell: {
      canvases: [{ id: 'hooks.main', initial: 'hooks.first' }],
      actions: {
        'hooks.first': {
          id: 'hooks.first',
          data: { seen: [] },
          layout: {
            component: 'Stack',
            children: [
              { for: '$.seen', as: 'hook', do: { component: 'Text', children: '$hook' } },
              { component: 'Button', ref: 'cover', children: 'Open another on top' },
            ],
          },
          lifecycle: {
            mount: [{ push: 'seen', value: 'mount' }],
            suspend: [{ push: 'seen', value: 'suspend' }],
            resume: [{ push: 'seen', value: 'resume' }],
          },
          triggers: [{ event: 'ui:click', ref: 'cover', do: [{ push: { action: 'hooks.second' } }] }],
        },
        'hooks.second': {
          id: 'hooks.second',
          layout: { component: 'Button', ref: 'back', children: 'Back' },
          triggers: [{ event: 'ui:click', ref: 'back', do: [{ pop: true }] }],
        },
      },
    },
    presses: [{ ref: 'cover' }, { ref: 'back' }],
    expected: { says: ['mount', 'suspend', 'mount', 'resume', 'Open another on top'], stacks: { 'hooks.main': ['hooks.first'] } },
  },
];
