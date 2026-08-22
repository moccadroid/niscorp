// Swap check — does the terminal's live render-target swap actually work?
// Two phases, headless: (1) the switcher logic on fake targets (does the
// hotkey fire, does it cycle); (2) the REAL react↔dom remount with content,
// which catches what fake targets can't — a createRoot-reuse throw, or React's
// async unmount wiping the DOM the next target just painted. If both pass, a
// dead hotkey in a browser means the COMBO is intercepted, not the code.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  KeyboardEvent: window.KeyboardEvent,
  Node: window.Node,
});

const { mountTerminal } = await import('@niscorp/moss/terminal');
const { reactTarget } = await import('@niscorp/moss/terminal/react');
const { domTarget } = await import('@niscorp/moss/terminal/dom');
const { createComponentRegistry } = await import('@niscorp/nova');
import type { RenderNode } from '@niscorp/nova';
import type { Wire } from '@niscorp/moss/client';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 30));
// Dispatch a realistic keydown: both `key` (the character) and `code` (the
// physical key), the way a browser does. The matcher keys on `key`.
const press = (key: string, mods: { ctrl?: boolean; shift?: boolean } = {}): void => {
  window.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, ctrlKey: mods.ctrl, shiftKey: mods.shift, bubbles: true }),
  );
};
const div = (): HTMLElement => {
  const el = window.document.createElement('div');
  window.document.body.appendChild(el);
  return el;
};

const checks: [string, boolean][] = [];

// ── phase 1: the switcher logic, fake targets ──
const log: string[] = [];
const fake = (name: string): ReturnType<typeof reactTarget> => () => {
  log.push(`mount:${name}`);
  return { update: () => undefined, destroy: () => log.push(`destroy:${name}`) };
};
// A stand-in for the real Wire, and it has to stay one. `status` and `reset`
// arrived with shell recovery and this literal never followed, so the terminal
// was being mounted on something that is not a wire — it passed only because
// nothing in this file reaches for the two it was missing. That is the whole
// failure mode of a hand-built double: it stops being a stand-in silently.
const bareWire: Wire = {
  subscribe: () => () => undefined,
  snapshot: () => ({ frame: [], trees: new Map() }),
  status: () => 'open',
  reset: () => undefined,
  back: () => undefined,
      popTo: () => undefined,
  dispatch: () => undefined,
  publish: () => undefined,
  dispose: () => undefined,
};
const phase1 = mountTerminal({ wire: bareWire, swapKey: 'ctrl+shift+y', targets: { a: fake('a'), b: fake('b') } });
press('y', { ctrl: true, shift: true });
checks.push(['the hotkey fires and cycles the target', log.join(',') === 'mount:a,destroy:a,mount:b']);
const n = log.length;
press('y'); // no mods
press('x', { ctrl: true, shift: true }); // wrong key
checks.push(['non-matching keys do not swap', log.length === n]);
// destroy phase 1 so its window listener stops interfering with phase 2 —
// and prove destroy() removes the listener at all.
phase1.destroy();
const m = log.length;
press('y', { ctrl: true, shift: true });
checks.push(['destroy() removes the hotkey listener (no more cycling)', log.length === m]);

// ── phase 2: the REAL react↔dom remount, with content ──
const frame: RenderNode[] = [{ type: 'component', name: 'CanvasSlot', props: { canvasId: 'main' }, children: [] }];
const trees = new Map<string, RenderNode[]>([['main', [{ type: 'text', value: 'HELLO-WORLD' }]]]);
const contentWire: Wire = {
  subscribe: () => () => undefined,
  snapshot: () => ({ frame, trees }),
  status: () => 'open',
  reset: () => undefined,
  back: () => undefined,
      popTo: () => undefined,
  dispatch: () => undefined,
  publish: () => undefined,
  dispose: () => undefined,
};
const root = div();
mountTerminal({
  wire: contentWire,
  swapKey: 'ctrl+shift+y',
  targets: { react: reactTarget({ root, registry: createComponentRegistry() }), dom: domTarget({ root }) },
});

await tick();
checks.push(['react target paints the content', (root.textContent ?? '').includes('HELLO-WORLD')]);

let threw = false;
try {
  press('y', { ctrl: true, shift: true }); // react → dom
  await tick();
} catch {
  threw = true;
}
const domOk = (root.textContent ?? '').includes('HELLO-WORLD') && root.classList.contains('nova-dom-root');
checks.push(['swap react → dom keeps the content (no async-unmount wipe, no throw)', domOk && !threw]);

try {
  press('y', { ctrl: true, shift: true }); // dom → react
  await tick();
} catch {
  threw = true;
}
checks.push(['swap dom → react re-mounts cleanly (createRoot reuse ok)', (root.textContent ?? '').includes('HELLO-WORLD') && !threw]);

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
}
console.log(`\nreact-log: ${log.join(' , ')}`);
if (failed > 0) {
  console.log(`\nFAIL — ${failed} check(s). The swap itself is broken (not just the combo).`);
  process.exit(1);
}
console.log('\nOK — the swap works with real targets. A dead hotkey in the browser is the COMBO being intercepted.');
process.exit(0);
