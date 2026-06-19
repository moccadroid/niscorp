// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import { Nova, type SlotWrapper } from '@react';

const textAction = (id: string, text: string): ActionDefinition => ({
  id,
  data: {},
  layout: { component: 'Text', children: text },
});

const settle = () => act(async () => { await Promise.resolve(); });

describe('slotWrapper — pluggable ActionSlot seam', () => {
  it('wraps an instance\'s content and is handed its identity', async () => {
    const calls: Array<{ canvasId?: string; instanceId?: string; actionId?: string }> = [];
    const Wrapper: SlotWrapper = ({ canvasId, instanceId, action, children }) => {
      calls.push({ canvasId, instanceId, actionId: action?.id });
      return <div data-testid="wrap">{children}</div>;
    };

    const shell = createShell({
      canvases: [{ id: 'main', initial: 'a' }],
      actions: { a: textAction('a', 'HELLO') },
    });
    await settle();

    render(<Nova.Shell shell={shell} slotWrapper={Wrapper} />);

    // Content renders, inside the wrapper.
    expect(screen.getByText('HELLO')).toBeDefined();
    expect(screen.getByTestId('wrap')).toBeDefined();

    // The wrapper was handed canvasId + the ActionDefinition + a real instanceId.
    const call = calls.find((c) => c.instanceId !== undefined);
    expect(call).toMatchObject({ canvasId: 'main', actionId: 'a' });
    expect(typeof call?.instanceId).toBe('string');

    shell.dispose();
  });

  it('is a no-op (passthrough) when none is provided', async () => {
    const shell = createShell({
      canvases: [{ id: 'main', initial: 'a' }],
      actions: { a: textAction('a', 'PLAIN') },
    });
    await settle();

    render(<Nova.Shell shell={shell} />);

    expect(screen.getByText('PLAIN')).toBeDefined();
    expect(screen.queryByTestId('wrap')).toBeNull();

    shell.dispose();
  });

  it('still renders the wrapper for an empty slot (so exits can animate)', async () => {
    const seen: Array<string | undefined> = [];
    const Wrapper: SlotWrapper = ({ instanceId, children }) => {
      seen.push(instanceId);
      return <div data-testid="wrap">{children}</div>;
    };

    // A canvas with no active instance: ActionSlot resolves to no instance, but
    // the wrapper must still mount (content = null) so a presence-managing
    // wrapper has somewhere to play an exit.
    const shell = createShell({ canvases: [{ id: 'main' }], actions: {} });
    await settle();

    render(<Nova.Shell shell={shell} slotWrapper={Wrapper} />);

    expect(screen.getByTestId('wrap')).toBeDefined();
    expect(seen.some((id) => id === undefined)).toBe(true);

    shell.dispose();
  });
});
