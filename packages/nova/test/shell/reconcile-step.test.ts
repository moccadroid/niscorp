import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { ActionDefinitionSchema } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ═══════════════════════════════════════════════════════════
// `reconcile` — the declarative verb as a step. An action names a list in its
// own data and a canvas; the canvas ends up holding exactly the actions the
// rows name. Every other navigation step moves ONE action, so a surface whose
// actions come from rows (a slide's tools) needs this one.
// ═══════════════════════════════════════════════════════════

const card = (id: string): ActionDefinition => ({ id, data: { label: '' } });

// The action that owns the tray: its `rows` say what should be on it, and a
// `sync` message makes it so.
const deck = (own?: 'pushed' | 'canvas'): ActionDefinition => ({
  id: 'deck',
  data: { rows: [] },
  triggers: [
    {
      message: 'sync',
      do: [{ reconcile: { canvas: 'tray', to: '$.rows', action: 'tool', input: 'seed', ...(own === undefined ? {} : { own }) } }],
    },
  ],
});

const setup = (own?: 'pushed' | 'canvas') =>
  createShell({
    canvases: [{ id: 'side', initial: 'deck' }, { id: 'tray', mode: 'list' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { deck: deck(own), A: card('A'), B: card('B'), C: card('C') },
  });

type Setup = ReturnType<typeof setup>;
const tray = (shell: Setup): string[] => shell.getCanvasState('tray').stack.map((item) => item.definitionId);
const instanceOf = (shell: Setup, actionId: string): string | undefined => shell.getCanvasState('tray').stack.find((item) => item.definitionId === actionId)?.id;

const syncTo = async (shell: Setup, rows: unknown[]): Promise<void> => {
  const id = shell.getCanvasState('side').active?.id ?? '';
  shell.getRuntime(id)?.setData({ rows });
  shell.publish('sync');
  await tick();
  await tick();
};

describe('the reconcile step', () => {
  it('places every action the rows name', async () => {
    const shell = setup();
    await tick();
    await syncTo(shell, [{ tool: 'A' }, { tool: 'B' }]);
    expect(tray(shell)).toEqual(['A', 'B']);
    shell.dispose();
  });

  it('removes what is no longer listed, keeps what still is — mounted, not re-opened', async () => {
    const shell = setup();
    await tick();
    await syncTo(shell, [{ tool: 'A' }, { tool: 'B' }]);
    const b = instanceOf(shell, 'B');
    await syncTo(shell, [{ tool: 'B' }, { tool: 'C' }]);
    expect(tray(shell)).toEqual(['B', 'C']);
    expect(instanceOf(shell, 'B')).toBe(b);
    shell.dispose();
  });

  it('an empty list — or no list at all — empties the canvas', async () => {
    const shell = setup();
    await tick();
    await syncTo(shell, [{ tool: 'A' }]);
    await syncTo(shell, []);
    expect(tray(shell)).toEqual([]);
    await syncTo(shell, [{ tool: 'A' }]);
    const id = shell.getCanvasState('side').active?.id ?? '';
    shell.getRuntime(id)?.setData({ rows: 'not a list' });
    shell.publish('sync');
    await tick();
    expect(tray(shell)).toEqual([]);
    shell.dispose();
  });

  it('skips a row naming an action this shell does not have, and a row with no action', async () => {
    const shell = setup();
    await tick();
    await syncTo(shell, [{ tool: 'A' }, { tool: 'not-granted' }, { other: 'x' }, { tool: '' }, 'junk']);
    expect(tray(shell)).toEqual(['A']);
    shell.dispose();
  });

  it('seeds each placed action from the row field `input` names', async () => {
    const shell = setup();
    await tick();
    await syncTo(shell, [{ tool: 'A', seed: { label: 'from the row' } }]);
    expect(shell.getRuntime(instanceOf(shell, 'A') ?? '')?.getData()['label']).toBe('from the row');
    shell.dispose();
  });

  it('by default leaves what somebody else put on the canvas', async () => {
    const shell = setup();
    await tick();
    shell.push('tray', 'C');
    await syncTo(shell, [{ tool: 'A' }]);
    expect(tray(shell)).toEqual(['C', 'A']);
    await syncTo(shell, []);
    expect(tray(shell)).toEqual(['C']);
    shell.dispose();
  });

  it('with own: "canvas" the canvas is the action\'s outright', async () => {
    const shell = setup('canvas');
    await tick();
    shell.push('tray', 'C');
    await syncTo(shell, [{ tool: 'A' }]);
    expect(tray(shell)).toEqual(['A']);
    shell.dispose();
  });

  it('what it placed is stamped with the action that placed it', async () => {
    const shell = setup();
    await tick();
    await syncTo(shell, [{ tool: 'A' }]);
    expect(shell.originOf(instanceOf(shell, 'A') ?? '')).toBe('deck');
    shell.dispose();
  });
});

describe('the reconcile step — schema', () => {
  const withStep = (step: unknown) => ActionDefinitionSchema.safeParse({ id: 'x', triggers: [{ message: 'm', do: [step] }] });

  it('parses', () => {
    expect(withStep({ reconcile: { to: '$.rows', action: 'tool_id' } }).success).toBe(true);
    expect(withStep({ reconcile: { to: '$.rows', action: 'tool_id', input: 'seed', canvas: 'tray', own: 'canvas', with: ['sheet'] } }).success).toBe(true);
  });

  it('refuses what it does not know', () => {
    expect(withStep({ reconcile: { to: '$.rows' } }).success).toBe(false);
    expect(withStep({ reconcile: { to: '$.rows', action: 'tool_id', own: 'everything' } }).success).toBe(false);
    expect(withStep({ reconcile: { to: '$.rows', action: 'tool_id', extra: 1 } }).success).toBe(false);
  });
});
