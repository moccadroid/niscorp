import { describe, expect, it } from 'vitest';
import type { ActionDefinition, LayoutNode } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import { DefinitionValidationError } from '@shared/errors';
import { createPermissiveRegistry } from '../helpers';

// A layout thousands of levels deep used to throw RangeError from inside the
// schema at createShell; it is refused as an invalid definition.
const deepLayout = (): LayoutNode => {
  let node: LayoutNode = { component: 'Text', props: { value: 'bottom' } };
  for (let i = 0; i < 20_000; i++) node = { component: 'Box', children: [node] };
  return node;
};

describe('a document nested past the depth limit', () => {
  it('is refused by createShell as an invalid definition', () => {
    const deep: ActionDefinition = { id: 'deep', layout: deepLayout() };
    const build = (): unknown => createShell({ canvases: [{ id: 'main' }], registry: createPermissiveRegistry(), layoutStore: createLayoutStore(), actions: { deep } });
    expect(build).toThrow(DefinitionValidationError);
  });

  it('is refused by the layout store', () => {
    expect(() => createLayoutStore().set('deep', deepLayout())).toThrow(DefinitionValidationError);
  });
});
