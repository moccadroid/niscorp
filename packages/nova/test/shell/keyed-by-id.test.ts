import { describe, expect, it } from 'vitest';
import type { ActionDefinition, ActionFragment } from '@action';
import { DefinitionValidationError } from '@shared/errors';
import type { NovaError } from '@shared/errors';
import { createShell } from '@shell';
import { createPermissiveRegistry } from '../helpers';

const shellWith = (actions: Record<string, ActionDefinition>, fragments: Record<string, ActionFragment> = {}, strict = false) => {
  const errors: NovaError[] = [];
  const shell = createShell({ canvases: [{ id: 'main' }], registry: createPermissiveRegistry(), actions, fragments, strict, onError: (error) => errors.push(error) });
  return { shell, errors };
};

describe('the actions and fragments maps are keyed by id', () => {
  it('an action filed under a key that is not its id is reported to onError, and the shell still loads it', () => {
    const { shell, errors } = shellWith({ a: { id: 'b', data: {} } }, { f: { kind: 'fragment', id: 'g' } });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(DefinitionValidationError);
    expect(errors[0]?.context?.['failures']).toMatchObject([
      { id: 'a', issues: [{ path: ['id'], input: 'b' }] },
      { id: 'f', issues: [{ path: ['id'], input: 'g' }] },
    ]);
    expect(() => shell.push('main', 'a')).not.toThrow();
  });

  it('a strict shell reports it too and is still created', () => {
    const { errors } = shellWith({ a: { id: 'b', data: {} } }, {}, true);
    expect(errors).toHaveLength(1);
  });

  it('maps keyed by id report nothing', () => {
    const { errors } = shellWith({ a: { id: 'a', data: {} } }, { f: { kind: 'fragment', id: 'f' } });
    expect(errors).toEqual([]);
  });
});
