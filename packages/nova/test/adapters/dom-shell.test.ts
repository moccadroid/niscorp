// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell, shellSettled, shellView, CANVAS_SLOT_NAME, ACTION_SLOT_NAME } from '@shell';
import type { Shell } from '@shell';
import { mountShell } from '../../src/adapters/dom';
import { renderToString } from '../../src/adapters/dom/server';
import { defaultRegistry, fallback } from '../../src/adapters/dom/components';

// ═══════════════════════════════════════════════════════════
// The DOM adapter over a shell that lives in the same process: drawn to markup
// where there is no browser, and mounted over that markup in the page. No
// framework, no server.
// ═══════════════════════════════════════════════════════════

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

const counter: ActionDefinition = {
  id: 'counter',
  data: { n: 0, label: 'Rooms & <suites>' },
  layout: { component: 'Stack', children: [{ component: 'Text', children: '$.label' }, { component: 'Text', children: '$.n' }, { component: 'Button', ref: 'bump', props: { label: 'bump' } }] },
  triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }],
};

// The app's kit, plus nova's two slot markers: a shell checks every name its
// layouts use against its registry, and its own default frame uses these. (The
// adapter resolves a CanvasSlot itself; an ActionSlot is drawn by the kit.)
const kit = (): ReturnType<typeof defaultRegistry> => {
  const registry = defaultRegistry();
  registry.register(CANVAS_SLOT_NAME, fallback);
  registry.register(ACTION_SLOT_NAME, fallback);
  return registry;
};

// Counter ids, so the markup a build writes names its instances as the page's shell will.
const boot = (): Shell => {
  let minted = 0;
  return createShell({ registry: kit(), canvases: [{ id: 'main', initial: 'counter' }], actions: { counter }, instanceIdFn: () => `act-${(minted += 1)}` });
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderToString — the DOM adapter, drawing to a string', () => {
  it('draws a local shell into the DOM it is handed, escaped', async () => {
    const shell = boot();
    await shellSettled(shell);
    const html = renderToString(kit(), shellView(shell).api, { window, fallback });
    expect(html).toContain('Rooms &amp; &lt;suites&gt;');
    expect(html).toContain('data-ref="bump"');
  });

  it('takes back every name it lent to the global scope', async () => {
    const shell = boot();
    const had = Object.getOwnPropertyDescriptor(globalThis, 'KeyboardEvent');
    renderToString(kit(), shellView(shell).api, { window, fallback });
    expect(Object.getOwnPropertyDescriptor(globalThis, 'KeyboardEvent')).toEqual(had);
  });

  it('two boots draw the same markup', async () => {
    const [a, b] = [boot(), boot()];
    await Promise.all([shellSettled(a), shellSettled(b)]);
    expect(renderToString(kit(), shellView(a).api, { window, fallback })).toBe(renderToString(kit(), shellView(b).api, { window, fallback }));
  });
});

describe('mountShell — a shell that lives in this page', () => {
  it('draws over markup written ahead of time with the same elements, and is alive', async () => {
    const built = boot();
    await shellSettled(built);
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = renderToString(kit(), shellView(built).api, { window, fallback });
    const written = root.innerHTML;

    const live = boot();
    await shellSettled(live);
    const mounted = mountShell(root, kit(), live, { fallback });
    expect(root.innerHTML).toBe(written);

    root.querySelector('[data-ref="bump"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(5);
    const active = live.getState().canvases['main']?.active?.id ?? '';
    expect(live.getRuntime(active)?.getData()['n']).toBe(1);
    expect(root.innerHTML).not.toBe(written);
    expect(root.textContent).toContain('1');

    // gone means gone: no further render after destroy
    mounted.destroy();
    expect(root.innerHTML).toBe('');
  });
});
