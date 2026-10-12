import { browserEnv, createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { lyceumTarget } from '@lyceum/ui/target';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

const seat = new URLSearchParams(window.location.search).get('seat');

// Page Up and Page Down are what a presenter's clicker sends.
const WAYS: Record<string, 'next' | 'back'> = { ArrowRight: 'next', PageDown: 'next', ArrowLeft: 'back', PageUp: 'back' };
window.addEventListener('keydown', (event) => {
  const way = WAYS[event.key];
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (way === undefined || typing || event.metaKey || event.ctrlKey || event.altKey) return;
  const button = document.querySelector(`[data-ref="${way}"]`);
  if (button instanceof HTMLElement) {
    event.preventDefault();
    button.click();
  } else if (import.meta.env.DEV && seat === 'stage') {
    event.preventDefault();
    void fetch(`/dev/deck/${way}`, { method: 'POST' });
  }
});

mountTerminal({
  targets: { dom: lyceumTarget({ root }) },
  resetKey: 'ctrl+shift+u',
  wire: createWire(seat === null || seat === '' ? {} : { env: browserEnv({ tokenKey: `nisc.token.${seat}` }) }),
});
