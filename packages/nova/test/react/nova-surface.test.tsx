// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import { Nova } from '@react';

const textAction = (id: string, text: string): ActionDefinition => ({
  id,
  data: {},
  layout: { component: 'Text', children: text },
});

describe('<Nova.Layout> — static layout surface', () => {
  it('renders an inline layout with no ceremony', () => {
    render(
      <Nova.Layout
        layout={{ component: 'Text', children: 'hello' }}
      />,
    );
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('resolves data bindings from the data prop', () => {
    render(
      <Nova.Layout
        layout={{ component: 'Text', children: '$.name' }}
        data={{ name: 'ada' }}
      />,
    );
    expect(screen.getByText('ada')).toBeDefined();
  });

  it('accepts extra components via the components prop', () => {
    const Badge = (({ children }: { children?: React.ReactNode }) => (
      <strong data-testid="badge">{children}</strong>
    )) as unknown as Parameters<typeof Nova.Layout>[0]['components'][string];
    render(
      <Nova.Layout
        layout={{ component: 'Badge', children: 'new' }}
        components={{ Badge }}
      />,
    );
    expect(screen.getByTestId('badge').textContent).toBe('new');
  });
});

describe('<Nova.Shell> — shell mount surface', () => {
  it('mounts a shell created without an explicit registry/store', async () => {
    const shell = createShell({
      canvases: [{ id: 'main', initial: 'a' }],
      actions: { a: textAction('a', 'HELLO') },
    });
    await act(async () => {
      await Promise.resolve();
    });

    render(<Nova.Shell shell={shell} />);
    expect(screen.getByText('HELLO')).toBeDefined();

    shell.dispose();
  });

  it('applies canvas.initial as a list of seeds', async () => {
    const shell = createShell({
      canvases: [
        {
          id: 'main',
          actionLayout: {
            component: 'Stack',
            children: [
              {
                for: '$.instances',
                as: 'i',
                key: 'id',
                do: { component: 'ActionSlot', props: { instanceId: '$.i.id' } },
              },
            ],
          },
          initial: ['a', 'b', 'c'],
        },
      ],
      actions: {
        a: textAction('a', 'ONE'),
        b: textAction('b', 'TWO'),
        c: textAction('c', 'THREE'),
      },
    });
    await act(async () => {
      await Promise.resolve();
    });

    render(<Nova.Shell shell={shell} />);
    const texts = screen.getAllByText(/ONE|TWO|THREE/).map((el) => el.textContent);
    expect(texts).toEqual(['ONE', 'TWO', 'THREE']);

    shell.dispose();
  });

  it('accepts initial seeds as an { action } object', async () => {
    const shell = createShell({
      canvases: [{ id: 'main', initial: { action: 'a' } }],
      actions: { a: textAction('a', 'BOXED') },
    });
    await act(async () => {
      await Promise.resolve();
    });

    render(<Nova.Shell shell={shell} />);
    expect(screen.getByText('BOXED')).toBeDefined();

    shell.dispose();
  });
});

describe('<Nova.Canvas> — single-canvas surface', () => {
  it('renders only the targeted canvas when shell prop is passed', async () => {
    const shell = createShell({
      canvases: [
        { id: 'left', initial: 'l' },
        { id: 'right', initial: 'r' },
      ],
      actions: {
        l: textAction('l', 'LEFT'),
        r: textAction('r', 'RIGHT'),
      },
    });
    await act(async () => {
      await Promise.resolve();
    });

    render(<Nova.Canvas shell={shell} id="left" />);
    expect(screen.getByText('LEFT')).toBeDefined();
    expect(screen.queryByText('RIGHT')).toBeNull();

    shell.dispose();
  });
});

describe('createShell sugar', () => {
  it('auto-creates registry and layoutStore when omitted', () => {
    const shell = createShell({
      canvases: [{ id: 'main' }],
      actions: { a: textAction('a', 'ok') },
    });
    expect(shell.registry).toBeDefined();
    expect(shell.layoutStore).toBeDefined();
    expect(shell.registry.has('Text')).toBe(false);
    shell.dispose();
  });

  it('merges components map onto the registry', () => {
    const shell = createShell({
      canvases: [{ id: 'main' }],
      actions: { a: textAction('a', 'ok') },
      components: {
        Custom: (() => null) as unknown as Parameters<typeof createShell>[0]['components'] extends infer T
          ? T extends Record<string, infer V>
            ? V
            : never
          : never,
      },
    });
    expect(shell.registry.has('Custom')).toBe(true);
    shell.dispose();
  });
});
