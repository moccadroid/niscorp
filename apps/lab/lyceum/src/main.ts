import { browserEnv, createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { lyceumTarget } from '@lyceum/ui/target';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

const seat = new URLSearchParams(window.location.search).get('seat');
const env = seat === null || seat === '' ? undefined : browserEnv({ tokenKey: `nisc.token.${seat}` });

// The speaker's controller can be put on a phone's home screen, opening full
// screen on the controller (public/remote.webmanifest). Offered only on the
// speaker's own pages, so nobody in the room is offered it.
const SPEAKER_SEATS = ['speaker', 'lectern'];
if (seat !== null && SPEAKER_SEATS.includes(seat)) {
  const add = (tag: 'link' | 'meta', attributes: Record<string, string>): void => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    document.head.append(node);
  };
  add('link', { rel: 'manifest', href: '/remote.webmanifest' });
  add('link', { rel: 'apple-touch-icon', href: '/remote-touch-icon.png' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Speaker' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  add('meta', { name: 'theme-color', content: '#000000' });
}
// Opened from the home screen with no speaker session (it lasts 12 hours): sign in first.
if (seat === 'speaker' && env !== undefined && env.tokens.load() === null && env.tokens.held?.() !== true) window.location.replace('/speaker');

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
  wire: createWire(env === undefined ? {} : { env }),
});
