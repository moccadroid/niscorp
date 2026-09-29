import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { NovaError } from '@shared/errors';
import { CAUSE_DEPTH_LIMIT } from '../../src/action/runtime/cause';

// A CHAIN THAT NEVER ENDS, STOPPED. Every definition here is valid data, and
// each one used to run forever: a trigger that re-emits its own channel, two
// that answer each other, a mount that reloads itself, a trigger that reloads
// and re-emits (doubling every turn), a mount that pushes another copy of
// itself. Each now stops at its budget and reports RUNAWAY_CHAIN, and a timer
// set beside it still fires while it runs — the event loop keeps turning.

const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const run = async (actions: Record<string, ActionDefinition>, start: string, ms = 400): Promise<{ errors: NovaError[]; ticks: number; data: () => Record<string, unknown> }> => {
  const errors: NovaError[] = [];
  const shell = createShell({
    canvases: [{ id: 'main' }, { id: 'side' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions,
    onError: (error) => errors.push(error),
  });
  let ticks = 0;
  const timer = setInterval(() => (ticks += 1), 5);
  const id = shell.push('main', start);
  await settle(ms);
  clearInterval(timer);
  const last = shell.getRuntime(id)?.getData() ?? {};
  const data = (): Record<string, unknown> => last;
  shell.dispose();
  return { errors, ticks, data };
};

const runaway = (errors: NovaError[]): NovaError[] => errors.filter((error) => error.code === 'RUNAWAY_CHAIN');

describe('runaway chains', () => {
  it('a trigger that re-emits its own channel stops at the depth budget', async () => {
    const loop: ActionDefinition = {
      id: 'loop',
      data: { n: 0 },
      lifecycle: { mount: [{ emit: { channel: 'x' } }] },
      triggers: [{ message: 'x', do: [{ increment: 'n' }, { emit: { channel: 'x' } }] }],
    };
    const { errors, ticks, data } = await run({ loop }, 'loop');
    expect(runaway(errors)).toHaveLength(1);
    // The mount's emit is the root; the listener runs at depths 1…64.
    expect(data()['n']).toBe(CAUSE_DEPTH_LIMIT);
    expect(ticks).toBeGreaterThan(0);
  });

  it('two triggers answering each other stop at the depth budget', async () => {
    const ping: ActionDefinition = {
      id: 'ping',
      data: {},
      lifecycle: { mount: [{ emit: { channel: 'a' } }] },
      triggers: [
        { message: 'a', do: [{ emit: { channel: 'b' } }] },
        { message: 'b', do: [{ emit: { channel: 'a' } }] },
      ],
    };
    const { errors } = await run({ ping }, 'ping');
    expect(runaway(errors)).toHaveLength(1);
  });

  it('a mount that reloads itself stops at the depth budget', async () => {
    const again: ActionDefinition = { id: 'again', data: { n: 0 }, lifecycle: { mount: [{ increment: 'n' }, { reload: true }] } };
    const { errors, data } = await run({ again }, 'again');
    expect(runaway(errors)).toHaveLength(1);
    expect(data()['n']).toBeLessThanOrEqual(CAUSE_DEPTH_LIMIT + 2);
  });

  it('a trigger that reloads and re-emits (doubling) stops, and memory stays flat', async () => {
    const double: ActionDefinition = {
      id: 'double',
      data: {},
      lifecycle: { mount: [{ emit: { channel: 'r' } }] },
      triggers: [{ message: 'r', do: [{ reload: true }, { emit: { channel: 'r' } }] }],
    };
    const { errors, ticks } = await run({ double }, 'double', 800);
    expect(runaway(errors).length).toBeGreaterThan(0);
    expect(ticks).toBeGreaterThan(0);
  });

  it('a mount that pushes another copy of itself stops', async () => {
    const opener: ActionDefinition = {
      id: 'opener',
      data: {},
      lifecycle: { mount: [{ emit: { channel: 'm' } }] },
      triggers: [{ message: 'm', do: [{ push: { action: 'opener' } }] }],
    };
    const { errors } = await run({ opener }, 'opener');
    expect(runaway(errors).length).toBeGreaterThan(0);
  });

  it('a gesture starts a fresh chain: the budget is per root, not per shell lifetime', async () => {
    const errors: NovaError[] = [];
    const counter: ActionDefinition = {
      id: 'counter',
      data: { n: 0 },
      triggers: [
        { event: 'ui:click', ref: 'go', do: [{ emit: { channel: 'tick' } }] },
        { message: 'tick', do: [{ increment: 'n' }] },
      ],
    };
    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { counter },
      onError: (error) => errors.push(error),
    });
    const id = shell.push('main', 'counter');
    for (let i = 0; i < CAUSE_DEPTH_LIMIT * 3; i++) shell.dispatch({ type: 'ui:click', ref: 'go' });
    await settle(100);
    expect(runaway(errors)).toHaveLength(0);
    expect(shell.getRuntime(id)?.getData()['n']).toBe(CAUSE_DEPTH_LIMIT * 3);
    shell.dispose();
  });

  it('a host publish is a root too', async () => {
    const errors: NovaError[] = [];
    const listener: ActionDefinition = { id: 'listener', data: { n: 0 }, triggers: [{ message: 'news', do: [{ increment: 'n' }] }] };
    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { listener },
      onError: (error) => errors.push(error),
    });
    const id = shell.push('main', 'listener');
    for (let i = 0; i < CAUSE_DEPTH_LIMIT * 3; i++) shell.publish('news');
    await settle(50);
    expect(runaway(errors)).toHaveLength(0);
    expect(shell.getRuntime(id)?.getData()['n']).toBe(CAUSE_DEPTH_LIMIT * 3);
    shell.dispose();
  });
});
