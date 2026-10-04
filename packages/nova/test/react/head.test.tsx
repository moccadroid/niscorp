// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Children, act, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, HEAD_NAME, HEAD_TITLE_NAME } from '@layout';
import { createShell, shellSettled } from '@shell';
import type { Shell } from '@shell';
import type { NovaComponent } from '@react';
import { NovaShell } from '@react';
import { registerNovaReactComponents } from '../../src/adapters/react/components';

// ═══════════════════════════════════════════════════════════
// A head under the React adapter: nothing is drawn for it or what it holds, and
// the page's <head> follows it for as long as the shell lives in the page.
// ═══════════════════════════════════════════════════════════

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

// A kit component that gives every child a cell: what a head must never be handed to.
const Cells: NovaComponent = ({ children }: { children?: ReactNode }) => (
  <div>
    {Children.map(children, (child) => (
      <span className="cell">{child}</span>
    ))}
  </div>
);

const article: ActionDefinition = {
  id: 'article',
  data: { title: 'First title' },
  layout: {
    component: 'Cells',
    children: [
      { component: HEAD_NAME, children: [{ component: HEAD_TITLE_NAME, children: '$.title' }] },
      { component: 'Text', children: '$.title' },
      { component: 'Button', ref: 'rename', props: { label: 'rename' } },
      { component: 'Button', ref: 'leave', props: { label: 'leave' } },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'rename', do: [{ set: 'title', value: 'Second title' }] },
    { event: 'ui:click', ref: 'leave', do: [{ replace: { canvas: 'main', action: 'plain' } }] },
  ],
};

const plain: ActionDefinition = { id: 'plain', data: {}, layout: { component: 'Text', children: 'no head here' } };

const boot = (): Shell => {
  const registry = createComponentRegistry<NovaComponent>();
  registerNovaReactComponents(registry);
  registry.register('Cells', Cells);
  return createShell({ registry, canvases: [{ id: 'main', initial: 'article' }], actions: { article, plain } });
};

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
};

const press = async (root: HTMLElement, label: string): Promise<void> => {
  const button = [...root.querySelectorAll('button')].find((el) => el.textContent === label);
  await act(async () => {
    button?.click();
  });
  await settle();
};

beforeEach(() => {
  document.head.innerHTML = '<title>The site</title>';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a head node, under the React adapter', () => {
  it('draws nothing, is not handed to the component it is a child of, and names no tab where there is no browser', async () => {
    const shell = boot();
    await shellSettled(shell);
    const html = renderToString(<NovaShell shell={shell} />);
    expect(html).not.toContain(HEAD_NAME);
    expect(html.match(/class="cell"/g)).toHaveLength(3);
    expect(document.title).toBe('The site');
  });

  it('the page adopts the drawn markup with nothing said', async () => {
    const built = boot();
    await shellSettled(built);
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = renderToString(<NovaShell shell={built} />);
    const shell = boot();
    await shellSettled(shell);
    const complaints: unknown[] = [];
    await act(async () => {
      hydrateRoot(root, <NovaShell shell={shell} />, { onRecoverableError: (error) => complaints.push(error) });
    });
    await settle();
    expect(complaints).toEqual([]);
    expect(document.title).toBe('First title');
  });

  it('the tab’s title follows the head: when it changes, and when the screen has none', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const shell = boot();
    await shellSettled(shell);
    const mounted = createRoot(root);
    await act(async () => {
      mounted.render(<NovaShell shell={shell} />);
    });
    await settle();
    expect(document.title).toBe('First title');

    await press(root, 'rename');
    expect(document.title).toBe('Second title');

    // a screen with no head has the document's own title again
    await press(root, 'leave');
    expect(root.textContent).toContain('no head here');
    expect(document.title).toBe('The site');
    await act(async () => {
      mounted.unmount();
    });
  });
});
