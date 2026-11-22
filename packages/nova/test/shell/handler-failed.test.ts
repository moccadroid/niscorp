import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import { createDataStore, createEventBus, createMessageBus } from '@shared';
import type { NovaError } from '@shared/errors';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const boom = (): never => {
  throw new Error('x');
};
const a: ActionDefinition = { id: 'a', data: { n: 0 }, layout: { component: 'Text', children: 'a' } };

const shellWith = (strict: boolean, seen: string[]) =>
  createShell({ canvases: [{ id: 'main' }], actions: { a }, strict, onError: (e: NovaError) => seen.push(`${e.code}: ${e.message}`) });

describe('a subscriber that throws', () => {
  it('is reported to onError in a strict shell, and the push still completes', async () => {
    const seen: string[] = [];
    const shell = shellWith(true, seen);
    shell.onStateChange(boom);
    const id = shell.push('main', 'a');
    await later();
    expect(shell.getCanvasState('main').active?.id).toBe(id);
    expect(seen).toContain('HANDLER_FAILED: x');
  });

  it("is reported for a runtime's data and status subscribers in a strict shell", async () => {
    const seen: string[] = [];
    const shell = shellWith(true, seen);
    const id = shell.push('main', 'a');
    await later();
    const runtime = shell.getRuntime(id);
    runtime?.onDataChange(boom);
    runtime?.onStatusChange(boom);
    runtime?.setData({ n: 1 });
    shell.push('main', 'a');
    await later();
    expect(seen).toEqual(['HANDLER_FAILED: x', 'HANDLER_FAILED: x']);
  });

  it('an onError that throws changes nothing: the push completes and the next subscriber runs', async () => {
    const a2: ActionDefinition = { id: 'a', layout: { component: 'Text', children: 'x' } };
    const shell = createShell({ strict: true, canvases: [{ id: 'main' }], actions: { a: a2 }, onError: (e) => { throw e; } });
    const seen: string[] = [];
    shell.onStateChange(() => { throw new Error('first'); });
    shell.onStateChange(() => { seen.push('second ran'); });
    expect(() => shell.push('main', 'a')).not.toThrow();
    await later();
    expect(seen).toEqual(['second ran']);
    expect(shell.getCanvasState('main').stack.map((i) => i.definitionId)).toEqual(['a']);
  });

  it('is not reported outside strict mode, as before', async () => {
    const seen: string[] = [];
    const shell = shellWith(false, seen);
    shell.onStateChange(boom);
    const id = shell.push('main', 'a');
    await later();
    shell.getRuntime(id)?.onDataChange(boom);
    shell.getRuntime(id)?.setData({ n: 1 });
    expect(seen).toEqual([]);
  });

  it('the buses and the data store hand it to onHandlerError and go on to the next handler', () => {
    const caught: unknown[] = [];
    const onHandlerError = (err: unknown): void => {
      caught.push(err);
    };
    let reached = 0;
    const events = createEventBus({ onHandlerError });
    events.on('ui:click', boom);
    events.on('ui:click', () => (reached += 1));
    const child = events.scoped();
    child.on('ui:click', boom);
    child.emit({ type: 'ui:click', ref: 'r' });
    const messages = createMessageBus({ onHandlerError });
    messages.subscribe('c', boom);
    messages.subscribe('c', () => (reached += 1));
    messages.publish('c');
    const store = createDataStore({ n: 0 }, { onHandlerError });
    store.subscribe(boom);
    store.update(() => ({ n: 1 }));
    expect(caught).toHaveLength(4);
    expect(reached).toBe(2);
  });
});
