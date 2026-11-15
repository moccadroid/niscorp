// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToString as reactToString } from 'react-dom/server';
import { flushPromises, mount } from '@vue/test-utils';
import type { ActionDefinition } from '@action';
import { createComponentRegistry } from '@layout';
import type { ComponentRegistry } from '@layout';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME, createShell, shellIdle, shellView } from '@shell';
import type { Shell } from '@shell';
import { NovaShell } from '@react';
import type { NovaComponent } from '@react';
import { registerNovaReactComponents } from '../../src/adapters/react/components';
import { NovaShell as VueNovaShell } from '../../src/adapters/vue';
import { createTtyView } from '../../src/adapters/tty';
import { defaultRegistry as ttyKit, fallback as ttyFallback } from '../../src/adapters/tty/components';
import { renderToString as domToString } from '../../src/adapters/dom/server';
import { defaultRegistry as domKit, fallback as domFallback } from '../../src/adapters/dom/components';

const frame: ActionDefinition = {
  id: 'frame',
  layout: { component: 'Stack', children: [{ component: 'Text', children: 'Frame' }, { component: 'CanvasSlot', props: { canvasId: 'main' } }] },
};

const SAID = 'canvas "main" is placed inside itself';

const boot = async (registry?: ComponentRegistry): Promise<Shell> => {
  const shell = createShell({ canvases: [{ id: 'main', initial: 'frame' }], actions: { frame }, ...(registry !== undefined ? { registry } : {}) });
  await shellIdle(shell);
  return shell;
};

describe('a canvas placed inside itself draws an error where it comes back', () => {
  it('in the TTY', async () => {
    const registry = ttyKit();
    registry.register(CANVAS_SLOT_NAME, ttyFallback);
    registry.register(ACTION_SLOT_NAME, ttyFallback);
    const shell = await boot(registry);
    const text = createTtyView(registry, shellView(shell).api).render().text;
    expect(text).toContain('Frame');
    expect(text).toContain(`RENDER_ERROR: ${SAID}`);
  });

  it('in the DOM', async () => {
    const registry = domKit();
    registry.register(CANVAS_SLOT_NAME, domFallback);
    registry.register(ACTION_SLOT_NAME, domFallback);
    const shell = await boot(registry);
    const markup = domToString(registry, shellView(shell).api, { window });
    expect(markup).toContain('Frame');
    expect(markup).toContain(`<div data-nova-error="RENDER_ERROR">RENDER_ERROR: ${SAID}</div>`);
  });

  it('in React', async () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaReactComponents(registry);
    const shell = await boot(registry);
    const markup = reactToString(<NovaShell shell={shell} registry={registry} />);
    expect(markup).toContain('Frame');
    expect(markup).toContain(`[RENDER_ERROR] ${SAID.replaceAll('"', '&quot;')}`);
  });

  it('in Vue', async () => {
    const shell = await boot();
    const wrapper = mount(VueNovaShell, { props: { shell } });
    await flushPromises();
    expect(wrapper.text()).toContain('Frame');
    expect(wrapper.text()).toContain(SAID);
    wrapper.unmount();
  });
});
