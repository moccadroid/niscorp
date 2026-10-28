import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { DefinitionValidationError } from '@shared/errors';
import { createShell } from '@shell';
import type { Desired, Reconciler, ReconcilerOptions } from '@shell/reconcile';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const keyOfRow = (entry: Desired): string => String(entry.row?.['key'] ?? '');

// What an app writes: rows matched by their `key`, several of one action, in the list's order.
const keyed: Reconciler = (shell, canvasId, desired, { origin, moveInstance, keyOf }) => {
  let changed = false;
  const stack = (): readonly { id: string }[] => shell.getCanvasState(canvasId).stack;
  const wanted = new Set(desired.map(keyOfRow));
  for (const item of stack()) {
    if (wanted.has(keyOf(item.id) ?? '')) continue;
    shell.removeInstance(canvasId, item.id);
    changed = true;
  }
  desired.forEach((entry, index) => {
    const key = keyOfRow(entry);
    const live = stack().find((item) => keyOf(item.id) === key)?.id;
    const id = live ?? shell.push(canvasId, entry.actionId, entry.input, entry.with, { origin, key });
    if (stack().findIndex((item) => item.id === id) !== index) moveInstance(canvasId, id, index);
    changed = true;
  });
  return { changed, notes: [] };
};

const text: ActionDefinition = { id: 'answer.text', data: { text: '', mounts: 0 }, lifecycle: { mount: [{ increment: 'mounts' }] } };

const step: ActionDefinition = {
  id: 'dock',
  data: { cards: [] },
  triggers: [
    { message: 'show', do: [{ reconcile: { canvas: 'answer', to: '$.cards', action: 'action', input: 'input', own: 'canvas' } }] },
    { message: 'show-plain', do: [{ reconcile: { canvas: 'plain', to: '$.cards', action: 'action', input: 'input', own: 'canvas' } }] },
    { message: 'grab', do: [{ reconcile: { canvas: 'stage', to: '$.cards', action: 'action', own: 'canvas' } }] },
  ],
};

const setup = (reconcilers: Record<string, Reconciler> = {}) => {
  const asked: { canvasId: string; desired: readonly Desired[] }[] = [];
  let options: ReconcilerOptions | undefined;
  const shell = createShell({
    canvases: [
      { id: 'side', initial: 'dock' },
      { id: 'answer', mode: 'list', reconcile: 'keyed' },
      { id: 'plain', mode: 'list' },
      { id: 'stage', reconcile: 'grab' },
    ],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { dock: step, 'answer.text': text, A: { id: 'A', data: { suspends: 0, resumes: 0 }, lifecycle: { suspend: [{ increment: 'suspends' }], resume: [{ increment: 'resumes' }] } } },
    reconcilers: {
      keyed: (...args) => {
        asked.push({ canvasId: args[1], desired: args[2] });
        return keyed(...args);
      },
      grab: (_shell, _canvasId, _desired, given) => {
        options = given;
        return { changed: false, notes: [] };
      },
      ...reconcilers,
    },
  });
  const say = async (channel: string, cards: unknown[]): Promise<void> => {
    shell.getRuntime(shell.getCanvasState('side').active?.id ?? '')?.setData({ cards });
    shell.publish(channel);
    await tick();
    await tick();
  };
  const grabbed = async (): Promise<ReconcilerOptions> => {
    await say('grab', []);
    if (options === undefined) throw new Error('the reconciler was never called');
    return options;
  };
  const cards = (canvas = 'answer'): (Record<string, unknown> & { id: string })[] =>
    shell.getCanvasState(canvas).stack.map((item) => ({ ...(shell.getRuntime(item.id)?.getData() ?? {}), id: item.id }));
  return { shell, asked, say, grabbed, cards };
};

const row = (key: string, words: string) => ({ key, action: 'answer.text', input: { text: words } });

describe('a canvas reconciled by a reconciler the app hands the shell', () => {
  it('is reconciled by the one it names, which is handed every row as written; a canvas that names none is reconciled as before', async () => {
    const { shell, asked, say, cards } = setup();
    await tick();
    const rows = [row('k1', 'one'), row('k2', 'two'), row('k3', 'three')];
    await say('show', rows);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.canvasId).toBe('answer');
    expect(asked[0]?.desired.map((entry) => entry.row)).toEqual(rows);
    expect(cards().map((card) => card['text'])).toEqual(['one', 'two', 'three']);
    await say('show-plain', rows);
    expect(asked).toHaveLength(1);
    expect(cards('plain').map((card) => card['text'])).toEqual(['one']);
    shell.dispose();
  });

  it('keeps a card whose key is still listed, with its data, wherever it moves; removes the unlisted; places the new', async () => {
    const { shell, say, cards } = setup();
    await tick();
    await say('show', [row('k1', 'one'), row('k2', 'two'), row('k3', 'three')]);
    const [one, two, three] = cards();
    const edited = shell.getRuntime(two?.id ?? '');
    edited?.setData({ ...edited.getData(), text: 'edited' });
    await say('show', [row('k3', 'three'), row('k2', 'two'), row('k4', 'four')]);
    const now = cards();
    expect(now.map((card) => card['text'])).toEqual(['three', 'edited', 'four']);
    expect(now.slice(0, 2).map((card) => card.id)).toEqual([three?.id, two?.id]);
    expect(now.slice(0, 2).map((card) => card['mounts'])).toEqual([1, 1]);
    expect(now.some((card) => card.id === one?.id)).toBe(false);
    shell.dispose();
  });

  it('is one step back when it changed the canvas', async () => {
    const { shell, say, cards } = setup();
    await tick();
    await say('show', [row('k1', 'one'), row('k2', 'two')]);
    await say('show', [row('k2', 'two'), row('k1', 'one')]);
    expect(shell.back()).toBe(true);
    expect(cards().map((card) => card['text'])).toEqual(['one', 'two']);
    expect(shell.back()).toBe(true);
    expect(cards()).toEqual([]);
    expect(shell.back()).toBe(false);
    shell.dispose();
  });

  it('refuses a canvas that names a reconciler the shell was not given, when the shell is made and when the canvas is added', () => {
    const made = () =>
      createShell({ canvases: [{ id: 'answer', reconcile: 'nowhere' }], registry: createPermissiveRegistry(), layoutStore: createLayoutStore(), actions: {} });
    expect(made).toThrow(DefinitionValidationError);
    expect(made).toThrow('canvas "answer" names the reconciler "nowhere", which the shell was not given');
    const { shell } = setup();
    expect(() => shell.addCanvas({ id: 'later', reconcile: 'toString' })).toThrow(DefinitionValidationError);
    expect(shell.getState().canvases['later']).toBeUndefined();
    shell.dispose();
  });
});

describe('what a reconciler is handed beside the shell', () => {
  it('keyOf answers the key an instance was pushed with, and nothing once it is gone', async () => {
    const { shell, grabbed } = setup();
    await tick();
    const { keyOf } = await grabbed();
    const id = shell.push('plain', 'answer.text', {}, undefined, { key: 'k9' });
    expect(keyOf(id)).toBe('k9');
    expect(keyOf(shell.push('plain', 'answer.text'))).toBeUndefined();
    shell.removeInstance('plain', id);
    expect(keyOf(id)).toBeUndefined();
    shell.dispose();
  });

  it('moveInstance reorders a canvas without re-mounting, and writes nothing to the journal', async () => {
    const { shell, say, grabbed, cards } = setup();
    await tick();
    await say('show', [row('k1', 'one'), row('k2', 'two'), row('k3', 'three')]);
    const { moveInstance } = await grabbed();
    const [one, two, three] = cards();
    moveInstance('answer', three?.id ?? '', 0);
    moveInstance('answer', one?.id ?? '', 99);
    expect(cards().map((card) => card.id)).toEqual([three?.id, two?.id, one?.id]);
    expect(cards().map((card) => card['mounts'])).toEqual([1, 1, 1]);
    moveInstance('answer', 'not-here', 0);
    moveInstance('answer', two?.id ?? '', -5);
    expect(cards().map((card) => card.id)).toEqual([two?.id, three?.id, one?.id]);
    expect(shell.back()).toBe(true);
    expect(cards()).toEqual([]);
    shell.dispose();
  });

  it('on a stack canvas, moving the top down suspends it and resumes the one now on top', async () => {
    const { shell, grabbed } = setup();
    await tick();
    const { moveInstance } = await grabbed();
    const below = shell.push('stage', 'A');
    const top = shell.push('stage', 'A');
    await tick();
    moveInstance('stage', top, 0);
    await tick();
    expect(shell.getCanvasState('stage').active?.id).toBe(below);
    expect(shell.getRuntime(top)?.getData()['suspends']).toBe(1);
    expect(shell.getRuntime(below)?.getData()['resumes']).toBe(1);
    shell.dispose();
  });
});
