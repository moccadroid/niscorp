import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { ShellConfig } from '@shell';
import { getInternalRuntime } from '@shell/shell-internals';

// ═══════════════════════════════════════════════════════════
// shell.back() — the navigation journal, from the outside. What a back
// button asks for: undo the last move, keep what survived it, and never
// walk off the bottom of the shell.
// ═══════════════════════════════════════════════════════════

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const A: ActionDefinition = { id: 'A', data: { tag: 'a' } };
const B: ActionDefinition = { id: 'B', data: { tag: 'b' } };
const C: ActionDefinition = { id: 'C', data: { tag: 'c' } };

const setup = (config: Partial<ShellConfig> = {}) =>
  createShell({
    canvases: [{ id: 'main' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { A, B, C },
    ...config,
  });

const ids = (shell: ReturnType<typeof createShell>, canvas = 'main'): string[] =>
  shell.getCanvasState(canvas).stack.map((i) => i.definitionId);

describe('shell.back — undoing a push', () => {
  it('pops the pushed screen and returns true', () => {
    const shell = setup();
    shell.push('main', 'A');
    shell.push('main', 'B');
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A']);
  });

  it('keeps the instance underneath — the very one, not a copy', () => {
    const shell = setup();
    const aId = shell.push('main', 'A');
    shell.push('main', 'B');
    shell.back();
    expect(shell.getCanvasState('main').active?.id).toBe(aId);
  });

  it('resumes the revealed instance', async () => {
    const shell = setup();
    shell.push('main', 'A');
    shell.push('main', 'B');
    await tick();
    expect(shell.getCanvasState('main').stack[0]?.status).toBe('suspended');
    shell.back();
    await tick();
    expect(shell.getCanvasState('main').active?.status).toBe('active');
  });

  it('walks back through several pushes, one press each', () => {
    const shell = setup();
    shell.push('main', 'A');
    shell.push('main', 'B');
    shell.push('main', 'C');
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A', 'B']);
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A']);
  });
});

describe('shell.back — the floor', () => {
  it('is false on a shell nobody has navigated', () => {
    const shell = setup();
    expect(shell.back()).toBe(false);
  });

  it('cannot undo a seeded canvas — the landing screen is the floor', () => {
    const shell = setup({ canvases: [{ id: 'main', initial: 'A' }] });
    expect(ids(shell)).toEqual(['A']);
    expect(shell.back()).toBe(false);
    expect(ids(shell)).toEqual(['A']);
  });

  it('cannot undo a push that declined the journal', () => {
    const shell = setup();
    shell.push('main', 'A', undefined, undefined, { history: false });
    expect(shell.back()).toBe(false);
    expect(ids(shell)).toEqual(['A']);
  });

  it('returns to the seeded floor and stops there', () => {
    const shell = setup({ canvases: [{ id: 'main', initial: 'A' }] });
    shell.push('main', 'B');
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A']);
    expect(shell.back()).toBe(false);
    expect(ids(shell)).toEqual(['A']);
  });
});

describe('shell.back — a pop somebody performed themselves', () => {
  it('spends the entry that pop satisfied, instead of going back twice', () => {
    const shell = setup();
    shell.push('main', 'A');
    shell.push('main', 'B');
    shell.push('main', 'C');
    shell.pop('main'); // their own back button, inside the app
    expect(ids(shell)).toEqual(['A', 'B']);
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A']); // one step, not two
  });

  it('runs out when every push has been popped by hand', () => {
    const shell = setup();
    shell.push('main', 'A');
    shell.push('main', 'B');
    shell.pop('main');
    shell.pop('main');
    expect(shell.back()).toBe(false);
    expect(ids(shell)).toEqual([]);
  });
});

describe('shell.back — undoing a replace', () => {
  it('brings the replaced screen back, derived from what made it', () => {
    const shell = setup();
    shell.push('main', 'A');
    const bId = shell.push('main', 'B', { row: 7 });
    shell.replace('main', 'C');
    expect(ids(shell)).toEqual(['A', 'C']);
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A', 'B']);
    const restored = shell.getCanvasState('main').active;
    // A NEW instance carrying the old one's input: back re-opens a screen, it
    // does not resurrect the instance a replace unmounted.
    expect(restored?.id).not.toBe(bId);
    expect(restored?.data['row']).toBe(7);
  });
});

describe('shell.back — undoing a clear', () => {
  it('puts the whole deck back', () => {
    const shell = setup();
    shell.push('main', 'A');
    shell.push('main', 'B');
    shell.clear('main');
    expect(ids(shell)).toEqual([]);
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A', 'B']);
  });
});

describe('shell.back — undoing a resetTo', () => {
  it('is one press, not two — a resetTo records one position', async () => {
    const shell = setup();
    shell.push('main', 'A');
    const bId = shell.push('main', 'B');
    await tick();
    const runtime = getInternalRuntime(shell, bId);
    if (runtime === undefined) throw new Error('no b');
    await runtime.executeSteps([{ resetTo: { action: 'C' } }]);
    await tick();
    expect(ids(shell)).toEqual(['C']);
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A', 'B']); // never through a blank canvas
  });
});

describe('shell.back — across canvases', () => {
  const two = () => setup({ canvases: [{ id: 'main' }, { id: 'aside' }] });

  it('walks the shell in the order things happened', () => {
    const shell = two();
    shell.push('main', 'A');
    shell.push('aside', 'B');
    shell.push('main', 'C');
    expect(shell.back()).toBe(true);
    expect(ids(shell, 'main')).toEqual(['A']);
    expect(ids(shell, 'aside')).toEqual(['B']);
    expect(shell.back()).toBe(true);
    expect(ids(shell, 'aside')).toEqual([]);
    expect(ids(shell, 'main')).toEqual(['A']);
  });

  it('leaves a canvas that changed underneath alone', () => {
    const shell = two();
    shell.push('main', 'A');
    shell.push('main', 'B');
    // Arrived while they were on main — a delivered notice, an agent's card.
    shell.push('aside', 'C');
    shell.back();
    expect(ids(shell, 'aside')).toEqual([]);
    expect(ids(shell, 'main')).toEqual(['A', 'B']);
    shell.back();
    expect(ids(shell, 'main')).toEqual(['A']);
  });
});

describe('shell.back — revocation', () => {
  it('cannot hand back an action the shell no longer serves', () => {
    const shell = setup();
    shell.push('main', 'A');
    shell.push('main', 'B');
    shell.replace('main', 'C');
    // The position back would have restored names B; B is revoked before they
    // press. Back walks past it to the next one it can honour — never through
    // the revoked screen.
    shell.removeAction('B');
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A']);
    shell.back();
    expect(ids(shell)).toEqual([]);
    // Back walked the whole journal out without B ever standing again.
    expect(shell.back()).toBe(false);
  });

  it('drops entries for a canvas that is gone', () => {
    const shell = setup({ canvases: [{ id: 'main' }, { id: 'aside' }] });
    shell.push('aside', 'A');
    shell.push('aside', 'B');
    shell.removeCanvas('aside');
    expect(shell.back()).toBe(false);
  });
});

describe('shell.back — historyDepth', () => {
  it('0 switches the journal off', () => {
    const shell = setup({ historyDepth: 0 });
    shell.push('main', 'A');
    shell.push('main', 'B');
    expect(shell.back()).toBe(false);
    expect(ids(shell)).toEqual(['A', 'B']);
  });

  it('bounds what can be walked back', () => {
    const shell = setup({ historyDepth: 1 });
    shell.push('main', 'A');
    shell.push('main', 'B');
    shell.push('main', 'C');
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['A', 'B']);
    expect(shell.back()).toBe(false); // the older position fell off the end
  });
});

describe('shell.back — a list canvas', () => {
  it('removes the card the last push added', () => {
    const shell = setup({ canvases: [{ id: 'tray', mode: 'list' }] });
    shell.push('tray', 'A');
    shell.push('tray', 'B');
    expect(shell.back()).toBe(true);
    expect(ids(shell, 'tray')).toEqual(['A']);
  });
});
