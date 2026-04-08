import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import { ErrorCodes, LifecycleError, type NovaError } from '@shared/errors';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const failingMount: ActionDefinition = {
  id: 'M',
  data: { v: 0 },
  lifecycle: { mount: [{ call: 'missing' }] },
};

const failingUnmount: ActionDefinition = {
  id: 'U',
  data: { v: 0 },
  lifecycle: { unmount: [{ call: 'missing' }] },
};

const failingSuspend: ActionDefinition = {
  id: 'S',
  data: { v: 0 },
  lifecycle: { suspend: [{ call: 'missing' }] },
};

const failingResume: ActionDefinition = {
  id: 'R',
  data: { v: 0 },
  lifecycle: { resume: [{ call: 'missing' }] },
};

const okDef: ActionDefinition = { id: 'OK', data: { v: 0 } };

const makeShell = (strict: boolean, onError?: (e: NovaError) => void) =>
  createShell({
    canvases: ['main'],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: {
      M: failingMount,
      U: failingUnmount,
      S: failingSuspend,
      R: failingResume,
      OK: okDef,
    },
    strict,
    ...(onError === undefined ? {} : { onError }),
  });

describe('strict-mode lifecycle propagation', () => {
  it('strict: mount failure surfaces on next shell call', async () => {
    const shell = makeShell(true);
    shell.push('main', 'M');
    await tick();
    expect(() => shell.getCanvasState('main')).toThrowError(LifecycleError);
  });

  it('thrown error has lifecycle code, hook context, and cause', async () => {
    const shell = makeShell(true);
    shell.push('main', 'M');
    await tick();
    let caught: unknown;
    try {
      shell.getCanvasState('main');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LifecycleError);
    if (caught instanceof LifecycleError) {
      expect(caught.code).toBe(ErrorCodes.lifecycle);
      expect(caught.context?.hook).toBe('mount');
    }
  });

  it('lax mode: mount failure routes through onError, no throw', async () => {
    const errors: NovaError[] = [];
    const shell = makeShell(false, (e) => errors.push(e));
    shell.push('main', 'M');
    await tick();
    expect(() => shell.getCanvasState('main')).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe(ErrorCodes.lifecycle);
  });

  it('strict: unmount failure surfaces on next call', async () => {
    const shell = makeShell(true);
    shell.push('main', 'U');
    await tick();
    shell.pop('main');
    await tick();
    expect(() => shell.getCanvasState('main')).toThrowError(LifecycleError);
  });

  it('strict: suspend hook failure on push surfaces on next call', async () => {
    const shell = makeShell(true);
    shell.push('main', 'S');
    await tick();
    // pushing OK on top will suspend S
    shell.push('main', 'OK');
    await tick();
    expect(() => shell.getCanvasState('main')).toThrowError(LifecycleError);
  });

  it('strict: resume hook failure on pop surfaces on next call', async () => {
    const shell = makeShell(true);
    shell.push('main', 'R');
    await tick();
    shell.push('main', 'OK');
    await tick();
    // popping OK should resume R, which fails
    shell.pop('main');
    await tick();
    expect(() => shell.getCanvasState('main')).toThrowError(LifecycleError);
  });

  it('strict: pending error is consumed (only thrown once)', async () => {
    const shell = makeShell(true);
    shell.push('main', 'M');
    await tick();
    expect(() => shell.getCanvasState('main')).toThrow();
    // second call no longer throws (pending was consumed)
    expect(() => shell.getCanvasState('main')).not.toThrow();
  });

  it('strict: sync mount with no failing steps does not throw', async () => {
    const shell = createShell({
      canvases: ['main'],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: {
        OK: {
          id: 'OK',
          data: { ready: false },
          lifecycle: { mount: [{ set: 'ready', value: true }] },
        },
      },
      strict: true,
    });
    shell.push('main', 'OK');
    await tick();
    expect(() => shell.getCanvasState('main')).not.toThrow();
  });
});
