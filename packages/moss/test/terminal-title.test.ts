// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { RenderNode } from '@niscorp/nova';
import { createTerminal } from '../src/terminal';
import type { Target } from '../src/terminal';
import { followTitle } from '../src/terminal/title';
import type { Wire } from '../src/client';

// ═══════════════════════════════════════════════════════════════
// The tab's title, kept on the screen the wire holds: a head node in the
// served trees names the tab, whichever render target is painting them.
// ═══════════════════════════════════════════════════════════════

const head = (title: string): RenderNode => ({ type: 'component', name: 'nova:head', props: { title }, children: [] });
const frame: RenderNode[] = [{ type: 'component', name: 'CanvasSlot', props: { canvasId: 'main' }, children: [] }];

// A wire as far as a terminal reads it: a snapshot, and somebody to tell.
const wireOf = (): { wire: Wire; show: (tree: RenderNode[]) => void } => {
  let trees = new Map<string, RenderNode[]>([['main', []]]);
  const listeners = new Set<() => void>();
  const wire = {
    snapshot: () => ({ frame, trees }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispatch: () => undefined,
    publish: () => undefined,
  } as unknown as Wire;
  return {
    wire,
    show: (tree) => {
      trees = new Map([['main', tree]]);
      for (const listener of listeners) listener();
    },
  };
};

const nothing: Target = () => ({ update: () => undefined, destroy: () => undefined });

beforeEach(() => {
  document.head.innerHTML = '<title>The site</title>';
});

describe('the terminal keeps the tab’s title on the screen', () => {
  it('follows the head in the served trees, and goes back to the page’s own when there is none', () => {
    const { wire, show } = wireOf();
    const terminal = createTerminal({ target: nothing, wire });
    expect(document.title).toBe('The site');

    show([head('An article'), { type: 'text', value: 'body' }]);
    expect(document.title).toBe('An article');

    show([{ type: 'text', value: 'a screen with no head' }]);
    expect(document.title).toBe('The site');

    terminal.destroy();
    show([head('After it left')]);
    expect(document.title).toBe('The site');
  });

  it('a drawn page’s own title is the one written beside the screen’s', () => {
    document.head.innerHTML = '<title data-own="The site">An article</title>';
    const { wire, show } = wireOf();
    const stop = followTitle(
      { frame: () => wire.snapshot().frame, canvasTree: (id) => wire.snapshot().trees.get(id) ?? [], dispatch: () => undefined, publish: () => undefined },
      wire.subscribe,
    );
    show([head('An article')]);
    show([]);
    expect(document.title).toBe('The site');
    stop();
  });
});
