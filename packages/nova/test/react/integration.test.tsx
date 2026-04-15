// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { NovaComponent } from '@react';
import {
  NovaShellProvider,
  RenderTree,
  useNovaDispatch,
  useRenderTree,
} from '@react';

// A minimal Input component that emits ui:model on change.
const Input: NovaComponent = (props) => {
  const dispatch = useNovaDispatch();
  const model = props['novaModel'];
  const value = typeof props['value'] === 'string' ? props['value'] : '';
  const refFromModel =
    typeof model === 'object' && model !== null && 'ref' in model && typeof (model as { ref: unknown }).ref === 'string'
      ? (model as { ref: string }).ref
      : undefined;
  return (
    <input
      data-testid="input"
      value={value}
      onChange={(e) => {
        if (refFromModel === undefined) return;
        dispatch({ type: 'ui:model', ref: refFromModel, payload: e.target.value });
      }}
    />
  );
};

const Host = ({ instanceId }: { instanceId: string }) => {
  const tree = useRenderTree(instanceId);
  return <RenderTree nodes={tree} />;
};

describe('React integration — model binding round-trip', () => {
  it('typing in an Input updates the action data and the next render', async () => {
    const registry = createComponentRegistry<NovaComponent>();
    registry.register('Input', Input);

    const layoutStore = createLayoutStore();

    const def: ActionDefinition = {
      id: 'Form',
      data: { name: '' },
      layout: {
        component: 'Input',
        ref: 'nameInput',
        model: '$.name',
        props: { value: '{{$.name}}' },
      },
    };

    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry,
      layoutStore,
      actions: { Form: def },
    });

    const instanceId = shell.push('main', 'Form');
    // Let mount resolve
    await act(async () => {
      await Promise.resolve();
    });

    render(
      <NovaShellProvider shell={shell} registry={registry}>
        <Host instanceId={instanceId} />
      </NovaShellProvider>,
    );

    const input = screen.getByTestId('input') as HTMLInputElement;
    expect(input.value).toBe('');

    fireEvent.change(input, { target: { value: 'ada' } });

    const runtime = shell.getRuntime(instanceId);
    expect(runtime?.getData()['name']).toBe('ada');

    // Re-render should reflect the new value.
    await act(async () => {
      await Promise.resolve();
    });
    expect((screen.getByTestId('input') as HTMLInputElement).value).toBe('ada');

    shell.dispose();
  });
});
