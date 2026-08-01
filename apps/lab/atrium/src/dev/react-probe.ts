// The browser path, headless: jsdom + the REAL react registry + the REAL wire
// against the running dev server. Whatever throws in a component throws HERE,
// with a stack — the dev checks assert server trees and never execute React,
// which is exactly how a render crash slips past a green suite.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5175/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'getComputedStyle'] as const) {
  Object.defineProperty(globalThis, key, { value: (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
}

const main = async (): Promise<void> => {
  const { createWire } = await import('@niscorp/moss/client');
  const { nodeEnv } = await import('@niscorp/moss/client/node');
  const { createTerminal } = await import('@niscorp/moss/terminal');
  const { reactTarget } = await import('@niscorp/moss/terminal/react');
  const { buildRegistry } = await import('../ui/registry');

  const errors: string[] = [];
  dom.window.addEventListener('error', (e) => errors.push(String(e.error?.stack ?? e.message)));
  process.on('uncaughtException', (e) => {
    console.log('CRASH:', e.stack ?? e.message);
    process.exit(1);
  });

  const root = dom.window.document.getElementById('root');
  if (root === null) throw new Error('no root');
  const wire = createWire({ env: nodeEnv({ url: 'ws://localhost:5175/socket', tokenFile: 'C:/Users/manxx/AppData/Local/Temp/claude/c--Users-manxx-Development-ai-Archive-niscorp/8869effc-0a57-43ec-ae30-c33adc944834/scratchpad/probe-token' }) });
  createTerminal({ target: reactTarget({ root, registry: buildRegistry() }), wire });

  setTimeout(() => {
    console.log('window errors:', errors.length === 0 ? '(none)' : errors.join('\n---\n'));
    console.log('root children:', root.children.length);
    console.log('root html head:', root.innerHTML.slice(0, 400));
    process.exit(0);
  }, 5000);
};

void main();
