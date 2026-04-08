import { describe, expect, it } from 'vitest';
import { createLayoutStore } from '@layout';
import type { LayoutNode } from '@layout';
import { DefinitionValidationError } from '@shared';

describe('createLayoutStore — set validation', () => {
  it('throws DefinitionValidationError on invalid layout', () => {
    const store = createLayoutStore();
    const bad = { component: 42 } as unknown as LayoutNode;
    expect(() => store.set('x', bad)).toThrow(DefinitionValidationError);
  });

  it('accepts a valid layout', () => {
    const store = createLayoutStore();
    expect(() =>
      store.set('x', { component: 'Text', props: { value: 'hi' } }),
    ).not.toThrow();
    expect(store.get('x')).toBeDefined();
  });
});
