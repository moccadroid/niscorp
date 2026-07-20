import { describe, it, expect } from 'vitest';
import {
  walkNodes,
  componentsOf,
  refsOf,
  loopVarsOf,
  actionGraph,
  classifyAudit,
  auditCatalog,
  snapshotShell,
  describeInstance,
} from '../../src/reflect';
import { createShell, createComponentRegistry } from '../../src';
import type { ActionDefinition } from '../../src';

// A layout exercising the collectors: a component with a prop-ref, a loop.
const layout = {
  component: 'Box',
  children: [
    { component: 'Table', props: { rowRef: 'open-row', columns: [] } },
    { component: 'Stack', for: '$.rows', as: 'r', do: { component: 'Text', ref: 'cell', children: '$.r.name' } },
  ],
};

describe('reflect — the walk + collectors', () => {
  it('walkNodes visits every record; componentsOf gathers component names', () => {
    const names: string[] = [];
    walkNodes(layout, (record) => {
      if (typeof record['component'] === 'string') names.push(record['component']);
    });
    expect(names).toEqual(['Box', 'Table', 'Stack', 'Text']);
    expect([...componentsOf(layout)].sort()).toEqual(['Box', 'Stack', 'Table', 'Text']);
  });

  it('refsOf finds refs inside props; loopVarsOf finds loop `as` names', () => {
    expect([...refsOf(layout)]).toEqual(['open-row']); // rowRef, a prop — not the node-level `ref`
    expect([...loopVarsOf(layout)]).toEqual(['r']);
  });
});

const defs: Record<string, ActionDefinition> = {
  home: { id: 'home', triggers: [{ event: 'ui:click', ref: 'go', do: [{ push: { action: 'deals' } }, { emit: { channel: 'nav' } }] }] },
  deals: { id: 'deals', triggers: [{ message: 'nav', do: [{ push: { action: 'ghost' } }] }] },
};

describe('reflect — the action graph', () => {
  it('edges: pushes, emits/listens, and dangling targets', () => {
    const graph = actionGraph(defs);
    const home = graph.nodes.find((n) => n.id === 'home');
    expect(home?.pushes).toEqual(['deals']);
    expect(home?.emits).toEqual(['nav']);
    expect(graph.nodes.find((n) => n.id === 'deals')?.listens).toEqual(['nav']);
    expect(graph.dangling).toEqual(['ghost']); // deals pushes an id nothing defines
  });
});

describe('reflect — audit classification', () => {
  const def: ActionDefinition = {
    id: 'x',
    data: {},
    layout: { component: 'Grid', for: '$.rows', as: 'row', do: { component: 'Text', children: '$.row.name' } },
  };
  it('a loop-var binding is info, a template push is info, an unexplained break is address', () => {
    expect(classifyAudit('layout binds "$.row.name" but data has no "row" default', def).kind).toBe('info');
    expect(classifyAudit('step pushes action "{{$.id}}" which is not in the catalog', def).kind).toBe('info');
    expect(classifyAudit('layout ref "save" has no trigger — dead chrome', def).kind).toBe('address');
  });

  it('auditCatalog classifies and sorts address-first', () => {
    const rows = auditCatalog(defs);
    // `deals` pushes `ghost` (not in catalog) — a real address-level finding
    const deals = rows.find((r) => r.id === 'deals');
    expect(deals?.issues.some((i) => i.kind === 'address' && i.issue.includes('ghost'))).toBe(true);
  });
});

describe('reflect — live shell', () => {
  it('snapshotShell shows mounted instances; describeInstance models one', async () => {
    const registry = createComponentRegistry();
    registry.register('Text', {} as Parameters<typeof registry.register>[1]);
    const shell = createShell({
      registry,
      canvases: [{ id: 'main', initial: 'counter' }],
      actions: { counter: { id: 'counter', data: { n: 0 }, layout: { component: 'Text', children: '$.n' } } },
    });
    await new Promise((r) => setTimeout(r, 0));

    const snap = snapshotShell(shell);
    const main = snap.canvases.find((c) => c.id === 'main');
    expect(main?.items[0]?.definitionId).toBe('counter');

    const active = shell.getState().canvases['main']?.active;
    const model = describeInstance(shell, active!.id);
    expect(model?.id).toBe('counter');
    expect(model?.data).toEqual({ n: 0 });
    expect(model?.layoutKind).toBe('inline');
  });
});
