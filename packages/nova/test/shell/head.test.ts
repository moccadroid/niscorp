import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, HEAD_NAME } from '@layout';
import type { LayoutNode, RenderNode } from '@layout';
import { createShell, headOf, shellSettled, shellView } from '@shell';
import type { Shell } from '@shell';

// The head a screen has: a node in a layout, read off the render tree.

// A registry that holds the app's own names and NOT the head's: nothing draws
// a head, so nothing has to be registered for one.
const names = (): ReturnType<typeof createComponentRegistry> => {
  const registry = createComponentRegistry();
  for (const name of ['CanvasSlot', 'ActionSlot', 'Stack', 'Text']) registry.register(name, {});
  return registry;
};

const article: ActionDefinition = {
  id: 'article',
  data: { page: { title: 'Types & <tags>', lead: 'What a type can and cannot promise.', cover: '/covers/types.png' }, loaded: true },
  layout: {
    component: 'Stack',
    children: [
      { component: HEAD_NAME, props: { title: '$.page.title', description: '$.page.lead', image: '$.page.cover', kind: 'article', structured: { '@type': 'Article', headline: '$.page.title' } } },
      { component: 'Text', children: '$.page.title' },
    ],
  },
};

const contact: ActionDefinition = {
  id: 'contact',
  data: {},
  layout: { component: 'Stack', children: [{ component: HEAD_NAME, props: { title: 'Contact' } }, { component: 'Text', children: 'Write to us' }] },
};

const plain: ActionDefinition = { id: 'plain', data: {}, layout: { component: 'Text', children: 'no head here' } };

const frame = (children: LayoutNode[]): LayoutNode => ({ component: 'Stack', children });
const slot = (canvasId: string): LayoutNode => ({ component: 'CanvasSlot', props: { canvasId } });

const shellOf = (extra: Partial<Parameters<typeof createShell>[0]> = {}): Shell =>
  createShell({
    registry: names(),
    canvases: [{ id: 'main', initial: 'article' }, { id: 'over' }],
    canvasLayout: frame([slot('main'), slot('over')]),
    actions: { article, contact, plain },
    strict: true,
    ...extra,
  });

describe('headOf — the head a screen has', () => {
  it('is a node in the layout: its bindings resolved, and the action it stands in named', async () => {
    const shell = shellOf();
    await shellSettled(shell);
    expect(headOf(shellView(shell).api)).toEqual({
      head: {
        title: 'Types & <tags>',
        description: 'What a type can and cannot promise.',
        image: '/covers/types.png',
        kind: 'article',
        structured: { '@type': 'Article', headline: 'Types & <tags>' },
      },
      action: 'article',
    });
  });

  it('a screen with no head node has none', async () => {
    const shell = shellOf({ canvases: [{ id: 'main', initial: 'plain' }, { id: 'over' }] });
    await shellSettled(shell);
    expect(headOf(shellView(shell).api)).toBeUndefined();
  });

  it('with two on the screen the last one speaks, whole', async () => {
    const shell = shellOf();
    shell.push('over', 'contact');
    await shellSettled(shell);
    // the dialog over the page says only its title — and the page's description
    // does not stand beside it
    expect(headOf(shellView(shell).api)).toEqual({ head: { title: 'Contact' }, action: 'contact' });
    shell.pop('over');
    expect(headOf(shellView(shell).api)?.action).toBe('article');
  });

  it('a head in the frame is the screen’s until an action says its own', async () => {
    const withSite = (initial: string): Shell =>
      shellOf({
        canvases: [{ id: 'main', initial }, { id: 'over' }],
        canvasLayout: frame([{ component: HEAD_NAME, props: { title: 'The site' } }, slot('main'), slot('over')]),
      });
    const [home, page] = [withSite('plain'), withSite('article')];
    await Promise.all([shellSettled(home), shellSettled(page)]);
    // in the frame it stands in no action
    expect(headOf(shellView(home).api)).toEqual({ head: { title: 'The site' } });
    expect(headOf(shellView(page).api)?.head.title).toBe('Types & <tags>');
  });

  it('what a node leaves empty, or says in a way its name does not take, is left out', async () => {
    const loading: ActionDefinition = {
      id: 'loading',
      data: { page: { title: '' } },
      layout: { component: 'Stack', children: [{ component: HEAD_NAME, props: { title: '$.page.title', description: '$.page.missing', kind: 'podcast', structured: 'not data' } }, { component: 'Text', children: '…' }] },
    };
    const shell = shellOf({ canvases: [{ id: 'main', initial: 'loading' }, { id: 'over' }], actions: { loading } });
    await shellSettled(shell);
    // still the one that speaks — it says nothing yet, so the document keeps its own
    expect(headOf(shellView(shell).api)).toEqual({ head: {}, action: 'loading' });
  });

  it('is not something to see: a canvas holding only a head is an empty canvas', async () => {
    const only: ActionDefinition = { id: 'only', data: {}, layout: { component: HEAD_NAME, props: { title: 'Unseen' } } };
    const shell = shellOf({ canvases: [{ id: 'main', initial: 'only' }, { id: 'over' }], actions: { only } });
    await shellSettled(shell);
    expect(shellView(shell).api.canvasTree('main')).toEqual([]);
    expect(headOf(shellView(shell).api)).toBeUndefined();
  });

  it('reads a served screen the same way: a frame and a tree per canvas', async () => {
    const shell = shellOf();
    await shellSettled(shell);
    const { api } = shellView(shell);
    const frameAsServed = api.frame();
    const trees: Record<string, RenderNode[]> = { main: api.canvasTree('main'), over: api.canvasTree('over') };
    expect(headOf({ frame: () => frameAsServed, canvasTree: (id) => trees[id] ?? [] })).toEqual(headOf(api));
  });
});
