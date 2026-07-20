import { describe, expect, it } from 'vitest';
import { createComponentRegistry } from '@layout';
import type { NovaComponent } from '@react';
import {
  registerNovaReactComponents,
  StackPropsSchema,
  TextPropsSchema,
  InputPropsSchema,
  ButtonPropsSchema,
  BoxPropsSchema,
} from '../../../src/adapters/react/components';

describe('registerNovaReactComponents', () => {
  it('registers all five built-in components', () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaReactComponents(registry);
    const names = registry.list();
    for (const name of ['Stack', 'Text', 'Input', 'Button', 'Box']) {
      expect(names).toContain(name);
    }
  });

  it('each entry has a non-empty description and the exact propsSchema', () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaReactComponents(registry);
    const expected = {
      Stack: StackPropsSchema,
      Text: TextPropsSchema,
      Input: InputPropsSchema,
      Button: ButtonPropsSchema,
      Box: BoxPropsSchema,
    };
    for (const [name, schema] of Object.entries(expected)) {
      const entry = registry.get(name);
      expect(entry).toBeDefined();
      if (entry === undefined) continue;
      expect(entry.meta.description).toBeTruthy();
      expect(entry.meta.propsSchema).toBe(schema);
    }
  });
});
