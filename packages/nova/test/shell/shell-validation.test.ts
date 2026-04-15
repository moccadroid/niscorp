import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';
import { DefinitionValidationError } from '@shared';

const makeDeps = () => ({
  canvases: [{ id: 'main' }],
  registry: createPermissiveRegistry(),
  layoutStore: createLayoutStore(),
});

describe('createShell — definition validation', () => {
  it('throws DefinitionValidationError for a malformed action definition', () => {
    // Missing required `id` — should fail schema validation.
    const bad = { data: { n: 1 } } as unknown as ActionDefinition;
    expect(() =>
      createShell({
        ...makeDeps(),
        actions: { A: bad },
      }),
    ).toThrow(DefinitionValidationError);
  });

  it('aggregates multiple failures', () => {
    const bad1 = { data: 5 } as unknown as ActionDefinition;
    const bad2 = { id: 123 } as unknown as ActionDefinition;
    try {
      createShell({
        ...makeDeps(),
        actions: { A: bad1, B: bad2 },
      });
      throw new Error('should have thrown');
    } catch (err) {
      if (!(err instanceof DefinitionValidationError)) throw err;
      const ctx = err.context;
      if (ctx === undefined) throw new Error('expected context');
      const failures = ctx['failures'];
      if (!Array.isArray(failures)) throw new Error('expected failures array');
      expect(failures.length).toBe(2);
    }
  });

  it('accepts valid action definitions', () => {
    const good: ActionDefinition = { id: 'A', data: { n: 1 } };
    expect(() =>
      createShell({
        ...makeDeps(),
        actions: { A: good },
      }),
    ).not.toThrow();
  });
});
