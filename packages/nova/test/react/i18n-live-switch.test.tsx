// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { createShell } from '../../src';
import { Nova } from '../../src/adapters/react';
import type { ActionDefinition } from '../../src';
import type { Phrasebook } from '../../src/i18n';

// ═══════════════════════════════════════════════════════════
// `setPhrases` THROUGH THE ADAPTER, not just through the runtime.
//
// The runtime-level test (test/i18n/render-pass.test.ts) proves `render()`
// returns the new words. It cannot prove a mounted React tree SHOWS them —
// and for one commit it did not: `useRenderTree` cached an instance's tree on
// its data identity alone, so a language change left every open screen holding
// the words it was mounted with. Data had not changed, so nothing invalidated.
//
// The two assertions below are the ones that failed. The chrome case passed
// the whole time, which is what made it easy to miss by looking.
// ═══════════════════════════════════════════════════════════

const GERMAN: Phrasebook = { 'Front desk': 'Empfang', 'Add a member': 'Mitglied hinzufügen' };

const desk: ActionDefinition = {
  id: 'desk',
  layout: {
    component: 'Stack',
    children: [
      { component: 'Text', children: 'Front desk' },
      { component: 'Button', props: { label: 'Add a member' }, ref: 'add' },
    ],
  },
};

const shellWith = (phrases: Phrasebook | undefined) =>
  createShell({
    canvases: [{ id: 'main', initial: 'desk' }],
    actions: { desk },
    ...(phrases === undefined ? {} : { phrases }),
  });

describe('setPhrases reaches a mounted React tree', () => {
  it('swaps the words of an instance that is ALREADY on screen', () => {
    const shell = shellWith(undefined);
    const { container } = render(<Nova.Shell shell={shell} />);
    expect(container.textContent).toContain('Front desk');
    expect(container.textContent).toContain('Add a member');

    act(() => {
      shell.setPhrases(GERMAN);
    });
    expect(container.textContent).toContain('Empfang');
    expect(container.textContent).toContain('Mitglied hinzufügen');
    expect(container.textContent).not.toContain('Front desk');
  });

  it('goes back to the source language when the book is withdrawn', () => {
    const shell = shellWith(GERMAN);
    const { container } = render(<Nova.Shell shell={shell} />);
    expect(container.textContent).toContain('Empfang');

    act(() => {
      shell.setPhrases(undefined);
    });
    expect(container.textContent).toContain('Front desk');
    expect(container.textContent).not.toContain('Empfang');
  });

  it('still re-renders on ordinary data changes', () => {
    const counter: ActionDefinition = {
      id: 'counter',
      data: { count: 0 },
      layout: { component: 'Text', children: 'Count: {{$.count}}' },
      triggers: [{ event: 'ui:click', ref: 'inc', do: [{ increment: 'count' }] }],
    };
    const shell = createShell({ canvases: [{ id: 'main', initial: 'counter' }], actions: { counter }, phrases: GERMAN });
    const { container } = render(<Nova.Shell shell={shell} />);
    expect(container.textContent).toContain('Count: 0');

    act(() => {
      shell.dispatch({ type: 'ui:click', ref: 'inc' });
    });
    expect(container.textContent).toContain('Count: 1');
  });
});
