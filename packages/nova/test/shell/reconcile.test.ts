import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell, reconcileCanvas } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const thread: ActionDefinition = { id: 'thread', data: { draft: '', stayId: '' } };
const brief: ActionDefinition = { id: 'brief', data: { note: '' } };

const setup = () =>
  createShell({
    canvases: [{ id: 'work' }, { id: 'detail' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { thread, brief },
  });

const idsOn = (shell: ReturnType<typeof setup>, canvas: string): string[] =>
  (shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.definitionId);

describe('reconcileCanvas — ownership', () => {
  it('by default leaves a card somebody else pushed', async () => {
    const shell = setup();
    const theirs = shell.push('detail', 'thread', { stayId: 'stay_olav' });
    await tick();

    const result = reconcileCanvas(shell, 'detail', [{ actionId: 'thread', input: { draft: 'Happy anniversary.' } }], { origin: 'agent' });

    expect(result.changed).toBe(false);
    expect(result.notes).toContain('left thread: not mine');
    expect(shell.getRuntime(theirs)?.getData()['draft']).toBe('');
  });

  it('...and never closes one either', async () => {
    const shell = setup();
    shell.push('detail', 'thread', { stayId: 'stay_olav' });
    await tick();

    reconcileCanvas(shell, 'detail', [], { origin: 'agent' });

    expect(idsOn(shell, 'detail')).toEqual(['thread']);
  });

  it('owning the canvas writes into a card somebody else pushed', async () => {
    const shell = setup();
    const theirs = shell.push('detail', 'thread', { stayId: 'stay_olav' });
    await tick();

    const result = reconcileCanvas(shell, 'detail', [{ actionId: 'thread', input: { draft: 'Happy anniversary.' } }], { origin: 'agent', own: 'canvas' });

    expect(result.changed).toBe(true);
    expect(shell.getRuntime(theirs)?.getData()['draft']).toBe('Happy anniversary.');
    expect(shell.getRuntime(theirs)?.getData()['stayId']).toBe('stay_olav');
  });

  it('...and closes one it is not asked to keep', async () => {
    const shell = setup();
    shell.push('detail', 'thread', { stayId: 'stay_olav' });
    await tick();

    const result = reconcileCanvas(shell, 'detail', [], { origin: 'agent', own: 'canvas' });

    expect(result.changed).toBe(true);
    expect(idsOn(shell, 'detail')).toEqual([]);
  });

  it('...and stamps what it pushes with its own origin', async () => {
    const shell = setup();
    shell.push('work', 'brief');
    await tick();

    reconcileCanvas(shell, 'work', [{ actionId: 'thread', input: { stayId: 'stay_nadia' } }], { origin: 'agent', own: 'canvas' });
    await tick();

    const stack = shell.getState().canvases['work']?.stack ?? [];
    expect(stack.map((item) => item.definitionId)).toEqual(['thread']);
    expect(shell.originOf(stack[0]?.id ?? '')).toBe('agent');
  });

  it('re-aims on a mount key rather than writing the old record a new id', async () => {
    const shell = setup();
    const theirs = shell.push('detail', 'thread', { stayId: 'stay_olav' });
    await tick();

    // `stayId` is a mount key: declared input, and read by the request of an
    // endpoint the mount hook calls.
    const loadsByStay = {
      ...thread,
      input: { type: 'object', properties: { stayId: { type: 'string' }, draft: { type: 'string' } } },
      endpoints: { load: { url: '/x', method: 'POST', request: { stayId: { $ref: '$.stayId' } }, target: 'loaded' } },
      lifecycle: { mount: [{ call: 'load' }] },
    } as unknown as ActionDefinition;

    reconcileCanvas(shell, 'detail', [{ actionId: 'thread', input: { stayId: 'stay_nadia' } }], {
      origin: 'agent',
      own: 'canvas',
      definitionOf: (id) => (id === 'thread' ? loadsByStay : undefined),
    });
    await tick();

    const stack = shell.getState().canvases['detail']?.stack ?? [];
    expect(stack).toHaveLength(1);
    expect(stack[0]?.id).not.toBe(theirs);
    expect(shell.getRuntime(stack[0]?.id ?? '')?.getData()['stayId']).toBe('stay_nadia');
  });
});
