import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createShell } from '@shell';
import { defaultRegistry as inkKit } from '../../src/adapters/ink';
import { NovaCanvas, NovaShell } from '@react';

describe('NovaShell and NovaCanvas handed a registry that has no CanvasSlot', () => {
  it('NovaShell adds what is missing and replaces none of what the registry has', () => {
    const registry = inkKit();
    const text = registry.get('Text')?.component;
    const shell = createShell({ canvases: [{ id: 'main' }], actions: {}, registry });
    renderToString(<NovaShell shell={shell} registry={registry} />);
    expect(registry.get('Text')?.component).toBe(text);
    expect(registry.has('CanvasSlot')).toBe(true);
  });

  it('NovaCanvas does the same', () => {
    const registry = inkKit();
    const stack = registry.get('Stack')?.component;
    const shell = createShell({ canvases: [{ id: 'main' }], actions: {}, registry });
    renderToString(<NovaCanvas id="main" shell={shell} registry={registry} />);
    expect(registry.get('Stack')?.component).toBe(stack);
    expect(registry.has('CanvasSlot')).toBe(true);
  });
});
