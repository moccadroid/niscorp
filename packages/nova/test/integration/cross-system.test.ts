import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createEventBus, createMessageBus } from '@shared';
import { createActionRuntime } from '@action/runtime/runtime';
import type { ActionDefinition } from '@action/schemas';

// Proves the unified data store: an action mutation propagates into the
// renderer reading from the same store instance on the very next render.
describe('cross-system — unified data store', () => {
  it('action mutation is reflected in the next layout render', async () => {
    const definition: ActionDefinition = {
      id: 'unified',
      data: { count: 0, label: 'init' },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', props: { value: '$.count' } },
          { component: 'Text', props: { value: '$.label' } },
        ],
      },
    };

    const runtime = createActionRuntime({
      definition,
      eventBus: createEventBus(),
      messageBus: createMessageBus(),
      layoutStore: createLayoutStore(),
      registry: createPermissiveRegistry(),
    });
    await runtime.mount();

    const before = runtime.render();
    const stackBefore = before[0];
    if (!stackBefore || stackBefore.type !== 'component') throw new Error('expected stack');
    const countBefore = stackBefore.children[0];
    if (!countBefore || countBefore.type !== 'component') throw new Error('expected text');
    expect(countBefore.props['value']).toBe(0);

    runtime.applyMutations([{ increment: 'count', by: 5 }, { set: 'label', value: 'updated' }]);

    const after = runtime.render();
    const stackAfter = after[0];
    if (!stackAfter || stackAfter.type !== 'component') throw new Error('expected stack');
    const countAfter = stackAfter.children[0];
    const labelAfter = stackAfter.children[1];
    if (!countAfter || countAfter.type !== 'component') throw new Error('expected text');
    if (!labelAfter || labelAfter.type !== 'component') throw new Error('expected text');
    expect(countAfter.props['value']).toBe(5);
    expect(labelAfter.props['value']).toBe('updated');
  });
});
