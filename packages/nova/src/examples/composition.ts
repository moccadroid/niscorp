import type { NovaExample } from './example.types';

// Fragments: chrome and wired behaviour kept once and put around an action
// when it is opened.
export const COMPOSITION_EXAMPLES: readonly NovaExample[] = [
  {
    id: 'slot-fill',
    group: 'composition',
    title: 'Slot fill',
    description: 'A fragment is chrome with a hole in it, `{ slot: "body" }`. An action opened `with` the fragment has its own layout put into the hole. The action does not mention the frame: whoever opens it decides, so the same action stands framed on one canvas and bare on the other.',
    fragments: {
      'slot-fill.frame': {
        kind: 'fragment',
        id: 'slot-fill.frame',
        layout: { component: 'Stack', children: [{ component: 'Text', children: 'Tonight' }, { slot: 'body' }, { component: 'Text', children: 'Doors at 19:00' }] },
      },
    },
    shell: {
      canvases: [
        { id: 'slot-fill.framed', initial: { action: 'slot-fill.show', with: ['slot-fill.frame'] } },
        { id: 'slot-fill.bare', initial: 'slot-fill.show' },
      ],
      actions: { 'slot-fill.show': { id: 'slot-fill.show', data: { title: 'The Tempest' }, layout: { component: 'Text', children: '$.title' } } },
    },
    presses: [],
    expected: { says: ['Tonight', 'The Tempest', 'Doors at 19:00', 'The Tempest'], stacks: { 'slot-fill.framed': ['slot-fill.show'], 'slot-fill.bare': ['slot-fill.show'] } },
  },
  {
    id: 'reuse',
    group: 'composition',
    title: 'Reuse',
    description: 'One frame around many actions. Each action is opened `with` the same fragment, and the frame’s heading reads each action’s own `label`. Change the fragment and all of them change.',
    fragments: {
      'reuse.tile': { kind: 'fragment', id: 'reuse.tile', layout: { component: 'Stack', children: [{ component: 'Text', children: '$.label' }, { slot: 'body' }] } },
    },
    shell: {
      canvases: [
        { id: 'reuse.first', initial: { action: 'reuse.sold', with: ['reuse.tile'] } },
        { id: 'reuse.second', initial: { action: 'reuse.free', with: ['reuse.tile'] } },
      ],
      actions: {
        'reuse.sold': { id: 'reuse.sold', data: { label: 'Sold', seats: 212 }, layout: { component: 'Text', children: '{{$.seats}} seats' } },
        'reuse.free': { id: 'reuse.free', data: { label: 'Free', rows: ['C', 'F'] }, layout: { component: 'Stack', children: [{ for: '$.rows', as: 'row', do: { component: 'Text', children: 'Row {{$row}}' } }] } },
      },
    },
    presses: [],
    expected: { says: ['Sold', '212 seats', 'Free', 'Row C', 'Row F'], stacks: { 'reuse.first': ['reuse.sold'], 'reuse.second': ['reuse.free'] } },
  },
  {
    id: 'merge-rules',
    group: 'composition',
    title: 'Merge rules',
    description: 'A fragment brings more than layout. Its `data` is merged under the action’s, so where both name a key the action’s value stands. Its `triggers` are added to the action’s, so both sets answer on the one instance.',
    fragments: {
      'merge-rules.star': {
        kind: 'fragment',
        id: 'merge-rules.star',
        data: { title: 'Untitled', starred: false },
        layout: { component: 'Stack', children: [{ slot: 'body' }, { component: 'Button', ref: 'star', children: 'Star' }] },
        triggers: [{ event: 'ui:click', ref: 'star', do: [{ toggle: 'starred' }] }],
      },
    },
    shell: {
      canvases: [{ id: 'merge-rules.main', initial: { action: 'merge-rules.show', with: ['merge-rules.star'] } }],
      actions: {
        'merge-rules.show': {
          id: 'merge-rules.show',
          data: { title: 'The Tempest', liked: false },
          layout: {
            component: 'Stack',
            children: [
              { component: 'Text', children: '$.title' },
              { component: 'Text', children: 'starred: {{$.starred}}, liked: {{$.liked}}' },
              { component: 'Button', ref: 'like', children: 'Like' },
            ],
          },
          triggers: [{ event: 'ui:click', ref: 'like', do: [{ toggle: 'liked' }] }],
        },
      },
    },
    presses: [{ ref: 'star' }, { ref: 'like' }],
    expected: { says: ['The Tempest', 'starred: true, liked: true', 'Like', 'Star'], stacks: { 'merge-rules.main': ['merge-rules.show'] } },
  },
  {
    id: 'stacking',
    group: 'composition',
    title: 'Stacking',
    description: '`with` takes a list. Each fragment wraps what the ones before it made, so the last one named ends up outermost.',
    fragments: {
      'stacking.inner': {
        kind: 'fragment',
        id: 'stacking.inner',
        layout: { component: 'Stack', children: [{ component: 'Text', children: 'inner begins' }, { slot: 'body' }, { component: 'Text', children: 'inner ends' }] },
      },
      'stacking.outer': {
        kind: 'fragment',
        id: 'stacking.outer',
        layout: { component: 'Stack', children: [{ component: 'Text', children: 'outer begins' }, { slot: 'body' }, { component: 'Text', children: 'outer ends' }] },
      },
    },
    shell: {
      canvases: [{ id: 'stacking.main', initial: { action: 'stacking.core', with: ['stacking.inner', 'stacking.outer'] } }],
      actions: { 'stacking.core': { id: 'stacking.core', layout: { component: 'Text', children: 'the action' } } },
    },
    presses: [],
    expected: { says: ['outer begins', 'inner begins', 'the action', 'inner ends', 'outer ends'], stacks: { 'stacking.main': ['stacking.core'] } },
  },
  {
    id: 'modal',
    group: 'composition',
    title: 'Modal',
    description: 'A dialog is an action pushed onto a canvas of its own, opened `with` a fragment that carries the frame and its Cancel. The form inside knows nothing of the frame. Saving says so on a channel the page listens to, and closes itself.',
    fragments: {
      'modal.frame': {
        kind: 'fragment',
        id: 'modal.frame',
        layout: { component: 'Stack', children: [{ component: 'Text', children: 'New guest' }, { slot: 'body' }, { component: 'Button', ref: 'cancel', children: 'Cancel' }] },
        triggers: [{ event: 'ui:click', ref: 'cancel', do: [{ pop: true }] }],
      },
    },
    shell: {
      canvases: [{ id: 'modal.page', initial: 'modal.guests' }, { id: 'modal.over' }],
      actions: {
        'modal.guests': {
          id: 'modal.guests',
          data: { guests: ['Ada'] },
          layout: {
            component: 'Stack',
            children: [
              { component: 'Text', children: 'Guests' },
              { for: '$.guests', as: 'guest', do: { component: 'Text', children: '$guest' } },
              { component: 'Button', ref: 'new', children: 'Add a guest' },
            ],
          },
          triggers: [
            { event: 'ui:click', ref: 'new', do: [{ push: { action: 'modal.form', canvas: 'modal.over', with: ['modal.frame'] } }] },
            { message: 'modal.saved', do: [{ push: 'guests', value: '@event.payload' }] },
          ],
        },
        'modal.form': {
          id: 'modal.form',
          data: { name: '' },
          layout: {
            component: 'Stack',
            children: [
              { component: 'Input', ref: 'name', model: '$.name', props: { placeholder: 'Their name' } },
              { component: 'Button', ref: 'save', children: 'Save' },
            ],
          },
          triggers: [{ event: 'ui:click', ref: 'save', do: [{ emit: { channel: 'modal.saved', payload: '$.name' } }, { pop: true }] }],
        },
      },
    },
    presses: [{ ref: 'new' }, { canvas: 'modal.over', ref: 'name', type: 'ui:model', payload: 'Grace' }, { canvas: 'modal.over', ref: 'save' }],
    expected: { says: ['Guests', 'Ada', 'Grace', 'Add a guest'], stacks: { 'modal.page': ['modal.guests'], 'modal.over': [] } },
  },
];
