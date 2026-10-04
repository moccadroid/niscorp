// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { RenderNode } from '@niscorp/nova';
import { createTerminal } from '../src/terminal';
import type { Target } from '../src/terminal';
import type { Wire } from '../src/client';

// ═══════════════════════════════════════════════════════════════
// The page's <head>, kept on the screen the wire holds: a `nova:head` in the
// served trees is the page's head, whichever render target is painting them.
// ═══════════════════════════════════════════════════════════════

const element = (name: string, props: Record<string, unknown>, text?: string): RenderNode => ({
  type: 'component',
  name,
  props,
  children: text === undefined ? [] : [{ type: 'text', value: text }],
});
const head = (title: string, description: string): RenderNode => ({
  type: 'component',
  name: 'nova:head',
  props: {},
  children: [element('nova:title', {}, title), element('nova:meta', { name: 'description', content: description })],
});
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
const OWN = '<title>The site</title><meta name="description" content="Everything about the site.">';
const description = (): string | null | undefined => document.head.querySelector('meta[name="description"]')?.getAttribute('content');

beforeEach(() => {
  document.head.innerHTML = OWN;
});

describe('the terminal keeps the page’s head on the screen', () => {
  it('follows the head in the served trees, and the page’s own comes back when the screen has none', () => {
    const { wire, show } = wireOf();
    const terminal = createTerminal({ target: nothing, wire });
    expect(document.head.innerHTML).toBe(OWN);

    show([head('An article', 'About it.'), { type: 'text', value: 'body' }]);
    expect(document.title).toBe('An article');
    expect(description()).toBe('About it.');
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);

    show([{ type: 'text', value: 'a screen with no head' }]);
    expect(document.head.innerHTML).toBe(OWN);

    terminal.destroy();
    show([head('After it left', 'Nobody is listening.')]);
    expect(document.head.innerHTML).toBe(OWN);
  });

  it('a page that arrived drawn: what the file was written with is taken over, and what gave way comes back', () => {
    document.head.innerHTML =
      '<title data-nova-head>An article</title><meta name="description" content="About it." data-nova-head><template data-nova-own><title>The site</title><meta name="description" content="Everything about the site."></template>';
    const { wire, show } = wireOf();
    const terminal = createTerminal({ target: nothing, wire });
    show([head('An article', 'About it.')]);
    expect(document.title).toBe('An article');
    expect(document.head.querySelectorAll('title')).toHaveLength(1);

    show([]);
    expect(document.title).toBe('The site');
    expect(description()).toBe('Everything about the site.');
    expect(document.head.querySelectorAll('[data-nova-head], template')).toHaveLength(0);
    terminal.destroy();
  });
});
