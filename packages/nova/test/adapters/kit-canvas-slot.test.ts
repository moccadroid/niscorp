import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell, shellView } from '@shell';
import { createTtyView } from '../../src/adapters/tty';
import { defaultRegistry as ttyKit } from '../../src/adapters/tty/components';
import { defaultRegistry as domKit } from '../../src/adapters/dom/components';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const hello: ActionDefinition = { id: 'hello', layout: { component: 'Button', ref: 'go', children: 'Hello' } };

describe('the DOM and TTY kits as the shell registry, as the README shows it', () => {
  it('the TTY kit draws the default shell layout', async () => {
    const registry = ttyKit();
    const shell = createShell({ canvases: [{ id: 'main', initial: 'hello' }], actions: { hello }, registry });
    await later();
    const text = createTtyView(registry, shellView(shell).api).render().text;
    expect(text).toContain('Hello');
    expect(text).not.toContain('COMPONENT_NOT_FOUND');
  });

  it('the DOM kit renders the default shell layout without a missing component', async () => {
    const errors: string[] = [];
    const shell = createShell({ canvases: [{ id: 'main', initial: 'hello' }], actions: { hello }, registry: domKit(), onError: (e) => errors.push(e.code) });
    await later();
    expect(JSON.stringify(shell.getShellRenderTree())).not.toContain('COMPONENT_NOT_FOUND');
    expect(errors).toEqual([]);
  });
});
