import { describe, expect, it } from 'vitest';
import type { ActionInstance } from '@action';
import { createCanvas } from '@shell/canvas';

const inst = (id: string): ActionInstance => ({
  id,
  definitionId: 'd',
  canvasId: 'main',
  status: 'active',
  data: {},
});

describe('createCanvas', () => {
  it('starts empty', () => {
    const c = createCanvas('main');
    expect(c.id).toBe('main');
    expect(c.peek()).toBeUndefined();
    expect(c.stack).toHaveLength(0);
  });

  it('push/pop/peek', () => {
    const c = createCanvas('main');
    c.pushInstance(inst('a'));
    c.pushInstance(inst('b'));
    expect(c.peek()?.id).toBe('b');
    expect(c.popInstance()?.id).toBe('b');
    expect(c.peek()?.id).toBe('a');
  });

  it('replaceTop returns previous', () => {
    const c = createCanvas('main');
    c.pushInstance(inst('a'));
    const prev = c.replaceTop(inst('b'));
    expect(prev?.id).toBe('a');
    expect(c.peek()?.id).toBe('b');
  });

  it('clearStack returns and clears', () => {
    const c = createCanvas('main');
    c.pushInstance(inst('a'));
    c.pushInstance(inst('b'));
    const removed = c.clearStack();
    expect(removed.map((i) => i.id)).toEqual(['a', 'b']);
    expect(c.stack).toHaveLength(0);
  });
});
