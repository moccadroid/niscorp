import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import type { LayoutNode, RenderNode } from '@layout';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// Collect every text value in a render tree (the actionLayout output).
const texts = (nodes: RenderNode[]): string[] =>
  nodes.flatMap((n) =>
    n.type === 'text' ? [n.value] : n.type === 'component' || n.type === 'fragment' ? texts(n.children) : [],
  );

// ═══════════════════════════════════════════════════════════
// instance.title — a per-instance label resolved from the action's `title`
// resolvable, exposed on the canvas actionLayout scope. Falls back name → id.
// ═══════════════════════════════════════════════════════════

describe('shell — instance.title on the actionLayout scope', () => {
  // An actionLayout that just prints every instance's resolved title.
  // A LayoutNode, which is what `actionLayout` takes — this was cast to
  // RenderNode, the RENDERED form. The two are different ends of the pipeline
  // and the cast said so was fine.
  const titleLayout: LayoutNode = {
    component: 'Box',
    children: { for: '$.instances', as: 'i', do: { component: 'Box', children: '{{$.i.title}}' } },
  } as unknown as LayoutNode;

  const setup = (actions: Record<string, ActionDefinition>) =>
    createShell({
      canvases: [{ id: 'main', actionLayout: titleLayout }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions,
    });

  it('resolves `title` against the instance data', async () => {
    const deal: ActionDefinition = { id: 'deal', title: '{{$.record.title}}' };
    const shell = setup({ deal });
    shell.push('main', 'deal', { record: { title: 'Premium Support' } });
    await tick();
    expect(texts(shell.getCanvasRenderTree('main'))).toContain('Premium Support');
  });

  it('falls back to `name`, then the action id, when no title is set', async () => {
    const named: ActionDefinition = { id: 'named', name: 'A Friendly Name' };
    const bare: ActionDefinition = { id: 'bare' };
    const shell = setup({ named, bare });
    shell.push('main', 'named');
    shell.push('main', 'bare');
    await tick();
    const out = texts(shell.getCanvasRenderTree('main'));
    expect(out).toContain('A Friendly Name');
    expect(out).toContain('bare');
  });

  it('falls back when the title resolves empty', async () => {
    const deal: ActionDefinition = { id: 'deal', name: 'Deal', title: '{{$.record.title}}' };
    const shell = setup({ deal });
    shell.push('main', 'deal', { record: {} }); // title resolves to '' → fall back to name
    await tick();
    expect(texts(shell.getCanvasRenderTree('main'))).toContain('Deal');
  });

  it('reflects live data changes in the title', async () => {
    const deal: ActionDefinition = { id: 'deal', title: '{{$.record.title}}' };
    const shell = setup({ deal });
    const id = shell.push('main', 'deal', { record: { title: 'Draft' } });
    await tick();
    expect(texts(shell.getCanvasRenderTree('main'))).toContain('Draft');
    shell.getRuntime(id)?.setData({ record: { title: 'Renamed' } });
    await tick();
    expect(texts(shell.getCanvasRenderTree('main'))).toContain('Renamed');
  });
});

// ═══════════════════════════════════════════════════════════
// shell.popTo — public on the Shell, so stack-nav chrome can jump to an
// ancestor via useShell().popTo(canvasId, instanceId) without an effect/trigger.
// ═══════════════════════════════════════════════════════════

describe('shell — public popTo', () => {
  const setup = () =>
    createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { A: { id: 'A' }, B: { id: 'B' }, C: { id: 'C' } },
    });

  it('pops the canvas down to the given instance', async () => {
    const shell = setup();
    const aId = shell.push('main', 'A');
    shell.push('main', 'B');
    shell.push('main', 'C');
    await tick();
    expect(shell.getCanvasState('main').stack.length).toBe(3);

    shell.popTo('main', aId);
    await tick();
    const st = shell.getCanvasState('main');
    expect(st.active?.id).toBe(aId);
    expect(st.stack.length).toBe(1);
  });

  it('is a no-op for an unknown instance', async () => {
    const shell = setup();
    shell.push('main', 'A');
    await tick();
    shell.popTo('main', 'nope');
    await tick();
    expect(shell.getCanvasState('main').stack.length).toBe(1);
  });
});
