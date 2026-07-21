import { createInterface } from 'node:readline';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyComponent, TtyFrame, TtyInteractive } from '@niscorp/nova/adapters/tty';
import { defaultRegistry, fallback as defaultFallback } from '@niscorp/nova/adapters/tty/components';
import type { ComponentRegistry, NovaEvent } from '@niscorp/nova';
import type { WireStatus } from '../../client';
import type { Target } from '../index';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/tty — the line-terminal render target: a REPL over
// the wire. nova's TTY adapter says what the screen IS ({ text, interactives });
// this target owns the stdio half — print each served frame, read lines, map
// them onto the adapter's numbered interactives with the same event
// vocabulary every other target dispatches (`ui:click`, `ui:model`, `ui:key`).
//
// The input scheme is "numbers act, words fill": a bare number taps [n] —
// click a button or row, flip a toggle, FOCUS an input (the next line typed
// is its value, verbatim; an empty line cancels) — and bare words go straight
// into the only input on screen. Command words (refs, help, quit, …) are the
// escape hatch, not the default. All of this is target policy: the wire, the
// server, and the apps never see anything but ordinary events.
//
// Runs on anything with a Readable/Writable pair: a real TTY, a test's
// PassThrough, a pipe. Node-shaped code lives here, never in the adapter.
// ═══════════════════════════════════════════════════════════

export type TtyTargetConfig = {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  // the app's TTY kit; omit for nova's default (floor kit + fallback)
  registry?: ComponentRegistry<TtyComponent>;
  fallback?: TtyComponent;
  // called on `quit` / EOF — the host owns the wire and the process, so the
  // target only reports the intent
  onQuit?: () => void;
  // the wire's connection state, when the host can supply it (wire.status) —
  // the REPL says '… connecting' / '✓ connected' / '× connection lost',
  // because a silent screen on a dead socket is indistinguishable from a
  // working terminal rendering an empty app
  status?: () => WireStatus;
  // coalesce a burst of wire updates into one repaint; 0 paints immediately
  debounceMs?: number;
  prompt?: string;
};

const HELP = [
  'type to act:',
  '  <n>       tap [n] — click a button or row, flip a toggle, focus an input',
  '  <words>   with one input on screen, typed words go straight into it',
  '  …while an input is focused, the next line is its value; empty line cancels',
  'commands:',
  '  click/set/toggle/key <n> …   the explicit forms of the above',
  '  refs                         list everything actionable',
  '  show                         reprint the current screen',
  '  publish <ch> [json]          publish on a channel',
  '  quit                         leave',
].join('\n');

export const ttyTarget = (config: TtyTargetConfig): Target => (api) => {
  const { input, output } = config;
  const view = createTtyView(config.registry ?? defaultRegistry(), api, { fallback: config.fallback ?? defaultFallback });
  const debounceMs = config.debounceMs ?? 80;
  const basePrompt = config.prompt ?? '› ';

  let last: TtyFrame = { text: '', interactives: [] };
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The focused input, tracked by identity (canvas + ref), never by index —
  // a repaint renumbers, identity survives the server echo.
  let focus: { canvas: string; ref: string; name: string } | null = null;

  const rl = createInterface({ input, output, prompt: basePrompt });
  const say = (text: string): void => void output.write(`${text}\n`);

  const valueText = (item: TtyInteractive): string =>
    typeof item.value === 'string' || typeof item.value === 'number' ? String(item.value) : '';
  const focusPrompt = (item: TtyInteractive): string => `${item.path ?? item.ref} ⟨${valueText(item)}⟩ › `;

  const findFocused = (): TtyInteractive | undefined =>
    focus === null
      ? undefined
      : last.interactives.find((item) => item.kind === 'model' && item.canvas === focus?.canvas && item.ref === focus?.ref);

  const enterFocus = (item: TtyInteractive): void => {
    focus = { canvas: item.canvas, ref: item.ref, name: item.path ?? item.ref };
    rl.setPrompt(focusPrompt(item));
    rl.prompt(true);
  };

  const exitFocus = (): void => {
    focus = null;
    rl.setPrompt(basePrompt);
  };

  // Report real transitions only: up once, down once — never the
  // closed↔connecting flap of every backoff retry.
  let link: 'unknown' | 'up' | 'down' = 'unknown';
  const checkStatus = (): void => {
    if (config.status === undefined) return;
    const now = config.status();
    if (now === 'open' && link !== 'up') {
      link = 'up';
      say('✓ connected');
      rl.prompt(true);
    } else if (now !== 'open' && link === 'up') {
      link = 'down';
      say('× connection lost — retrying');
      rl.prompt(true);
    } else if (link === 'unknown') {
      link = 'down';
      say('… connecting');
    }
  };

  const paint = (force = false): void => {
    const frame = view.render();
    const changed = frame.text !== last.text;
    last = frame;
    // Focus follows identity across repaints; if the input left the screen
    // (navigation, sign-out), focus drops with a note instead of swallowing
    // the next line silently.
    if (focus !== null) {
      const still = findFocused();
      if (still === undefined) {
        say(`input ${focus.name} left the screen`);
        exitFocus();
      } else rl.setPrompt(focusPrompt(still));
    }
    if (!changed && !force) return;
    if (frame.text !== '') say(`\n${frame.text}`);
    rl.prompt(true);
  };

  const update = (): void => {
    // Status transitions print immediately — never debounced with the trees.
    checkStatus();
    if (debounceMs === 0) {
      paint();
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(paint, debounceMs);
  };

  // Dispatch for a numbered interactive — the canvas was recorded at render
  // time; frame chrome ('') dispatches nothing, same as every other target.
  const act = (interactive: TtyInteractive, event: NovaEvent): void => {
    if (interactive.canvas === '') {
      say(`[${interactive.index}] is frame chrome — it dispatches nothing`);
      return;
    }
    api.dispatch(interactive.canvas, event);
  };

  const fill = (interactive: TtyInteractive, value: string): void =>
    act(interactive, { type: 'ui:model', ref: interactive.ref, payload: value });

  const flip = (interactive: TtyInteractive): void =>
    act(interactive, { type: 'ui:model', ref: interactive.ref, payload: interactive.value !== true });

  // A bare number: act by kind — the tap of this terminal.
  const tap = (interactive: TtyInteractive): void => {
    if (interactive.kind === 'model') {
      enterFocus(interactive);
      return;
    }
    if (interactive.kind === 'toggle') {
      flip(interactive);
      return;
    }
    act(interactive, interactive.value === undefined
      ? { type: 'ui:click', ref: interactive.ref }
      : { type: 'ui:click', ref: interactive.ref, payload: interactive.value });
  };

  const find = (token: string | undefined): TtyInteractive | undefined => {
    const index = Number(token);
    if (!Number.isInteger(index)) return undefined;
    return last.interactives.find((item) => item.index === index);
  };

  const onLine = (raw: string): void => {
    // Focused input: the whole line is the value, verbatim — even words that
    // look like commands. An empty line cancels.
    if (focus !== null) {
      const target = findFocused();
      if (raw !== '' && target !== undefined) fill(target, raw);
      exitFocus();
      rl.prompt();
      return;
    }

    const line = raw.trim();
    if (line === '') {
      rl.prompt();
      return;
    }
    const [head = '', second, ...restTokens] = line.split(/\s+/);
    const rest = restTokens.join(' ');

    if (head === 'help') say(HELP);
    else if (head === 'show') paint(true);
    else if (head === 'quit' || head === 'exit') {
      if (config.onQuit !== undefined) config.onQuit();
      else say('no quit handler — Ctrl+C to leave');
      return;
    } else if (head === 'refs') {
      if (last.interactives.length === 0) say('nothing actionable on screen');
      for (const item of last.interactives) {
        const where = item.canvas === '' ? 'frame' : item.canvas;
        say(`[${item.index}] ${item.kind}  ${item.ref} @${where}  ${item.label}${item.path !== undefined ? `  (${item.path})` : ''}`);
      }
    } else if (head === 'publish') {
      if (second === undefined) say('usage: publish <channel> [json]');
      else if (rest === '') api.publish(second);
      else {
        try {
          api.publish(second, JSON.parse(rest));
        } catch {
          api.publish(second, rest);
        }
      }
    } else if (head === 'set') {
      const target = find(second);
      if (target === undefined) say(`no [${second ?? '?'}] on screen — try refs`);
      else if (target.kind === 'model') {
        // `set 1 alex` fills; a bare `set 1` focuses instead of sending ''
        if (rest === '') enterFocus(target);
        else fill(target, rest);
      } else if (target.kind === 'toggle') {
        if (rest === 'true' || rest === 'false') act(target, { type: 'ui:model', ref: target.ref, payload: rest === 'true' });
        else say(`[${target.index}] is a toggle — use: toggle ${target.index}`);
      } else say(`[${target.index}] is not an input`);
    } else if (head === 'toggle') {
      const target = find(second);
      if (target === undefined) say(`no [${second ?? '?'}] on screen — try refs`);
      else if (target.kind === 'toggle') flip(target);
      else say(`[${target.index}] is not a toggle`);
    } else if (head === 'key') {
      const target = find(second);
      if (target === undefined) say(`no [${second ?? '?'}] on screen — try refs`);
      else if (target.kind === 'model' && rest !== '') act(target, { type: 'ui:key', ref: target.ref, key: rest });
      else say('usage: key <n> <key> — on an input');
    } else if (head === 'click' || /^\d+$/.test(head)) {
      const target = find(head === 'click' ? second : head);
      if (target === undefined) say(`no [${head === 'click' ? second ?? '?' : head}] on screen — try refs`);
      else tap(target);
    } else {
      // Not a command and not a number: words fill the only input on screen.
      const inputs = last.interactives.filter((item) => item.kind === 'model');
      if (inputs.length === 1 && inputs[0] !== undefined) fill(inputs[0], line);
      else if (inputs.length === 0) say(`unknown command: ${head} — try help`);
      else say(`several inputs on screen — pick one: ${inputs.map((item) => `[${item.index}]`).join(' ')}`);
    }
    rl.prompt();
  };

  rl.on('line', onLine);
  // EOF (Ctrl+D / a closed pipe) means the same as `quit`.
  rl.on('close', () => config.onQuit?.());

  say('[moss/tty] terminal attached — type what you see: a number taps [n], words fill the input. "help" for more.');
  checkStatus();
  paint(true);

  return {
    update,
    destroy: () => {
      clearTimeout(timer);
      rl.removeAllListeners();
      rl.close();
    },
  };
};
