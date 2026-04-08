import { describe, expect, it } from 'vitest';
import {
  ComponentNotFoundError,
  DefinitionValidationError,
  ErrorCodes,
  LayoutRefNotFoundError,
  LifecycleError,
  NovaError,
  RenderError,
  ShellDisposedError,
  UnknownActionError,
} from '@shared';

describe('NovaError hierarchy', () => {
  it('NovaError carries code, message, context, cause', () => {
    const cause = new Error('underlying');
    const err = new NovaError(ErrorCodes.render, 'boom', { key: 1 }, { cause });
    expect(err.code).toBe('RENDER_ERROR');
    expect(err.message).toBe('boom');
    expect(err.context).toEqual({ key: 1 });
    expect(err.cause).toBe(cause);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof NovaError).toBe(true);
  });

  it('subclasses set code and name and inherit from NovaError', () => {
    const cases: [NovaError, string, string][] = [
      [new RenderError('x'), 'RENDER_ERROR', 'RenderError'],
      [new ComponentNotFoundError('x', { name: 'A' }), 'COMPONENT_NOT_FOUND', 'ComponentNotFoundError'],
      [new LayoutRefNotFoundError('x', { ref: 'A' }), 'LAYOUT_REF_NOT_FOUND', 'LayoutRefNotFoundError'],
      [new DefinitionValidationError('x', { failures: [] }), 'DEFINITION_VALIDATION_ERROR', 'DefinitionValidationError'],
      [new UnknownActionError('x', { actionId: 'A' }), 'UNKNOWN_ACTION', 'UnknownActionError'],
      [new ShellDisposedError('x'), 'SHELL_DISPOSED', 'ShellDisposedError'],
      [new LifecycleError('x', { hook: 'mount' }), 'LIFECYCLE_ERROR', 'LifecycleError'],
    ];
    for (const [err, code, name] of cases) {
      expect(err.code).toBe(code);
      expect(err.name).toBe(name);
      expect(err instanceof NovaError).toBe(true);
    }
  });

  it('ComponentNotFoundError carries name in context', () => {
    const err = new ComponentNotFoundError('not found', { name: 'Widget' });
    expect(err.context).toEqual({ name: 'Widget' });
  });

  it('LifecycleError carries hook in context', () => {
    const err = new LifecycleError('failed', { hook: 'unmount', instanceId: 'a1' });
    expect(err.context).toMatchObject({ hook: 'unmount', instanceId: 'a1' });
  });
});
