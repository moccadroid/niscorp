import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createComponentRegistry } from '@layout';
import type { NovaComponent } from '@react';
import { registerNovaReactComponents } from '../../../src/adapters/react/components';

describe('component meta introspection', () => {
  it('every registered component exposes a queryable description and Zod props schema', () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaReactComponents(registry);

    const names = registry.list();
    expect(names.length).toBeGreaterThanOrEqual(5);

    for (const name of names) {
      const entry = registry.get(name);
      expect(entry).toBeDefined();
      if (entry === undefined) continue;

      const { description, propsSchema } = entry.meta;

      expect(typeof description).toBe('string');
      expect(description).toBeTruthy();

      expect(propsSchema).toBeDefined();
      if (propsSchema === undefined) continue;
      expect(propsSchema instanceof z.ZodType).toBe(true);

      // The schema must be callable end-to-end.
      const result = propsSchema.safeParse({});
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    }
  });
});
