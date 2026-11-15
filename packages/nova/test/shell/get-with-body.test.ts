import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { DefinitionValidationError } from '@shared/errors';
import type { NovaError } from '@shared/errors';
import { createShell, shellIdle } from '@shell';
import { createPermissiveRegistry } from '../helpers';

const search: ActionDefinition = {
  id: 'search',
  data: { q: 'a', rows: [] },
  endpoints: {
    find: { url: '/api/find', method: 'GET', request: { q: { $ref: '$.q' } }, target: 'rows' },
    list: { url: '/api/list', method: 'GET', target: 'rows' },
    save: { url: '/api/save', method: 'POST', request: { q: { $ref: '$.q' } } },
  },
};

const shellWith = (actions: Record<string, ActionDefinition>) => {
  const errors: NovaError[] = [];
  const shell = createShell({ canvases: [{ id: 'main' }], registry: createPermissiveRegistry(), actions, onError: (error) => errors.push(error) });
  return { shell, errors };
};

describe('a GET endpoint with a request body', () => {
  it('is reported to onError when the shell starts, naming the action and endpoint, and the action still pushes', async () => {
    const { shell, errors } = shellWith({ search });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(DefinitionValidationError);
    expect(errors[0]?.code).toBe('DEFINITION_VALIDATION_ERROR');
    expect(errors[0]?.context?.['failures']).toMatchObject([{ id: 'search', issues: [{ path: ['endpoints', 'find', 'request'] }] }]);
    const id = shell.push('main', 'search');
    await shellIdle(shell);
    expect(shell.getRuntime(id)?.getData()['q']).toBe('a');
  });

  it('is reported when registered on a running shell, and the action is loaded', () => {
    const { shell, errors } = shellWith({});
    shell.registerAction(search);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.context?.['failures']).toMatchObject([{ id: 'search', issues: [{ path: ['endpoints', 'find', 'request'] }] }]);
    expect(() => shell.push('main', 'search')).not.toThrow();
  });

  it('GET without a request and POST with one report nothing', () => {
    const { list, save } = search.endpoints ?? {};
    const { errors } = shellWith({ plain: { id: 'plain', data: {}, endpoints: { ...(list === undefined ? {} : { list }), ...(save === undefined ? {} : { save }) } } });
    expect(errors).toEqual([]);
  });
});
