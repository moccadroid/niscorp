// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import type { ActionDefinition } from '@action';
import { createShell, shellSettled } from '@shell';
import type { Shell } from '@shell';
import { createComponentRegistry } from '@layout';
import type { NovaComponent } from '@react';
import { NovaShell, NovaShellProvider, RenderTree, useCanvas, useRenderTree } from '@react';
import { registerNovaReactComponents } from '../../src/adapters/react/components';

// ═══════════════════════════════════════════════════════════
// A shell drawn ahead of time, and picked up.
//
// The app's own boot is run twice: once where there is no browser (a build),
// drawn to markup through the shell-backed components and hooks; once in the
// page, where a second shell adopts that markup and is alive. No server holds
// either shell.
// ═══════════════════════════════════════════════════════════

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const counter: ActionDefinition = {
  id: 'counter',
  data: { n: 0, label: 'Rooms & <suites>' },
  layout: { component: 'Stack', children: [{ component: 'Text', children: '$.label' }, { component: 'Text', children: '$.n' }, { component: 'Button', ref: 'bump', props: { label: 'bump' } }] },
  triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }],
};

// One boot, as a browser-shell app writes it — called at build and in the page.
const boot = (): Shell => {
  const registry = createComponentRegistry<NovaComponent>();
  registerNovaReactComponents(registry);
  return createShell({ registry, canvases: [{ id: 'main', initial: 'counter' }], actions: { counter } });
};

afterEach(() => {
  document.body.innerHTML = '';
});

const page = (html: string): HTMLElement => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = html;
  return root;
};

describe('a shell drawn to markup', () => {
  it('<NovaShell> draws where there is no browser — the hooks have a server snapshot', async () => {
    const shell = boot();
    await shellSettled(shell);
    const html = renderToString(<NovaShell shell={shell} />);
    expect(html).toContain('Rooms &amp; &lt;suites&gt;');
    expect(html).toContain('<button');
  });

  it('a second boot adopts it: the same elements, nothing complained about — and a press changes the screen', async () => {
    const built = boot();
    await shellSettled(built);
    const root = page(renderToString(<NovaShell shell={built} />));
    const parsed = root.innerHTML;
    const button = root.querySelector('button');

    const live = boot();
    await shellSettled(live);
    const complaints = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      hydrateRoot(root, <NovaShell shell={live} />);
    });
    expect(complaints).not.toHaveBeenCalled();
    complaints.mockRestore();
    expect(root.innerHTML).toBe(parsed);
    expect(root.querySelector('button')).toBe(button);

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const active = live.getState().canvases['main']?.active?.id ?? '';
    expect(live.getRuntime(active)?.getData()['n']).toBe(1);
    expect(root.textContent).toContain('1');
  });

  it('an app’s own frame over the hooks draws and adopts the same way', async () => {
    // What a hand-written entry looks like (mythos's main.tsx): useCanvas + useRenderTree.
    const Active = ({ canvasId }: { canvasId: string }): React.JSX.Element => {
      const canvas = useCanvas(canvasId);
      const tree = useRenderTree(canvas.active?.id ?? '');
      return <RenderTree nodes={tree} />;
    };
    const Frame = ({ shell }: { shell: Shell }): React.JSX.Element => (
      <NovaShellProvider shell={shell}>
        <main>
          <Active canvasId="main" />
        </main>
      </NovaShellProvider>
    );

    const built = boot();
    await shellSettled(built);
    const root = page(renderToString(<Frame shell={built} />));
    const live = boot();
    await shellSettled(live);
    const complaints = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      hydrateRoot(root, <Frame shell={live} />);
    });
    expect(complaints).not.toHaveBeenCalled();
    complaints.mockRestore();
    expect(root.querySelector('main')?.textContent).toContain('Rooms & <suites>');
  });
});
