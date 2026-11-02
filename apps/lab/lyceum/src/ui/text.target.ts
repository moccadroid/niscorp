import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import type { Target } from '@niscorp/moss/terminal';
import { textRegistry } from './text.kit';

// The screen as Nova's line terminal draws it, in a page: every button and
// field numbered. Type a number to press it, or a number and words to fill a
// field in.
const eventOf = (target: TtyInteractive, words: string): { type: 'ui:click' | 'ui:model'; ref: string; payload: unknown; origin?: string } | undefined => {
  const origin = target.origin === undefined ? {} : { origin: target.origin };
  if (target.kind === 'click' || target.kind === 'row') return { type: 'ui:click', ref: target.ref, payload: target.value, ...origin };
  if (target.kind === 'toggle') return { type: 'ui:model', ref: target.ref, payload: target.value !== true, ...origin };
  if (target.kind === 'model') return { type: 'ui:model', ref: target.ref, payload: words, ...origin };
  return undefined;
};

export const textRenderer = (host: HTMLElement): Target => (api) => {
  const doc = host.ownerDocument;
  const view = createTtyView(textRegistry, api);
  const screen = doc.createElement('pre');
  screen.className = 'terminal';
  const line = doc.createElement('input');
  line.className = 'terminal-line';
  line.placeholder = 'A number to press it, or a number and words';
  line.spellcheck = false;
  line.autocomplete = 'off';
  const name = doc.createElement('span');
  name.className = 'renderer';
  name.textContent = 'Terminal';
  const page = doc.createElement('div');
  page.className = 'page terminal-page';
  page.append(screen, line, name);
  host.append(page);

  let interactives: TtyInteractive[] = [];
  const draw = (): void => {
    const frame = view.render();
    screen.textContent = frame.text;
    interactives = frame.interactives;
    page.toggleAttribute('data-projector', api.canvasTree('strip').length > 0);
  };
  line.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const typed = /^\s*(\d+)\s*(.*)$/.exec(line.value);
    line.value = '';
    const target = typed === null ? undefined : interactives.find((one) => one.index === Number(typed[1]));
    const sent = target === undefined || typed === null ? undefined : eventOf(target, typed[2] ?? '');
    if (target !== undefined && sent !== undefined && target.canvas !== '') api.dispatch(target.canvas, sent);
  });
  draw();
  return { update: draw, destroy: () => page.remove() };
};
