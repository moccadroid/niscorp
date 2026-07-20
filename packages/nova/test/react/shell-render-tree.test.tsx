// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { NovaComponent } from '@react';
import { NovaShellProvider, RenderTree, useShellRenderTree } from '@react';
import { registerNovaReactComponents } from '../../src/adapters/react/components';

const Host = () => {
  const tree = useShellRenderTree();
  return <RenderTree nodes={tree} />;
};

const makeDef = (id: string, text: string): ActionDefinition => ({
  id,
  data: {},
  layout: { component: 'Text', children: text },
});

describe('Shell render tree — slot-driven rendering', () => {
  it('default layouts render top-of-stack for each canvas (card-deck mode)', async () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaReactComponents(registry);
    // Text isn't registered by default; use a tiny inline one.
    registry.register('Text', ((props: { children?: React.ReactNode }) => (
      <span data-testid="text">{props.children}</span>
    )) as NovaComponent);
    const layoutStore = createLayoutStore();

    const shell = createShell({
      canvases: [{ id: 'nav' }, { id: 'main' }],
      registry,
      layoutStore,
      actions: { a: makeDef('a', 'NAV'), b: makeDef('b', 'MAIN') },
    });

    shell.push('nav', 'a');
    shell.push('main', 'b');
    await act(async () => {
      await Promise.resolve();
    });

    render(
      <NovaShellProvider shell={shell} registry={registry}>
        <Host />
      </NovaShellProvider>,
    );

    const texts = screen.getAllByTestId('text').map((el) => el.textContent);
    expect(texts).toContain('NAV');
    expect(texts).toContain('MAIN');

    shell.dispose();
  });

  it('custom actionLayout list mode renders every instance in the stack', async () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaReactComponents(registry);
    registry.register('Text', ((props: { children?: React.ReactNode }) => (
      <span data-testid="text">{props.children}</span>
    )) as NovaComponent);
    const layoutStore = createLayoutStore();

    const shell = createShell({
      canvases: [
        {
          id: 'main',
          actionLayout: {
            component: 'Stack',
            props: { direction: 'row' },
            children: [
              {
                for: '$.instances',
                as: 'i',
                key: 'id',
                do: { component: 'ActionSlot', props: { instanceId: '$.i.id' } },
              },
            ],
          },
        },
      ],
      registry,
      layoutStore,
      actions: { a: makeDef('a', 'ONE'), b: makeDef('b', 'TWO'), c: makeDef('c', 'THREE') },
    });

    shell.push('main', 'a');
    shell.push('main', 'b');
    shell.push('main', 'c');
    await act(async () => {
      await Promise.resolve();
    });

    render(
      <NovaShellProvider shell={shell} registry={registry}>
        <Host />
      </NovaShellProvider>,
    );

    const texts = screen.getAllByTestId('text').map((el) => el.textContent);
    expect(texts).toEqual(['ONE', 'TWO', 'THREE']);

    shell.dispose();
  });

  it('flattenRenderTree materialises slot markers for non-React consumers', async () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaReactComponents(registry);
    registry.register('Text', (() => null) as NovaComponent);
    const layoutStore = createLayoutStore();

    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry,
      layoutStore,
      actions: { a: makeDef('a', 'HELLO') },
    });

    shell.push('main', 'a');
    await Promise.resolve();

    const flat = shell.flattenRenderTree(shell.getShellRenderTree());
    const json = JSON.stringify(flat);
    expect(json).toContain('"HELLO"');
    // CanvasSlot resolves away; the ActionSlot marker SURVIVES, carrying the
    // instance identity so a remote renderer can key reconciliation by
    // instance and an app slotWrapper can wrap each one.
    expect(json).not.toContain('CanvasSlot');
    expect(json).toContain('ActionSlot');
    const instanceId = shell.getCanvasState('main').active?.id;
    expect(json).toContain(`"instanceId":"${instanceId}"`);
    expect(json).toContain('"definitionId":"a"');
    expect(json).toContain('"canvasId":"main"');

    shell.dispose();
  });
});
