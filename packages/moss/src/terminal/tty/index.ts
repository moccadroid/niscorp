import { createInterface } from 'node:readline';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyComponent, TtyFrame } from '@niscorp/nova/adapters/tty';
import { defaultRegistry, fallback as defaultFallback } from '@niscorp/nova/adapters/tty/components';
import type { ComponentRegistry } from '@niscorp/nova';
import type { WireStatus } from '../../client';
import type { Target } from '../index';
import { runLine } from './commands';
import { createFocus } from './focus';
import { createLinkReport } from './link';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/tty — the line-terminal render target: a REPL over
// the wire. nova's TTY adapter says what the screen IS ({ text, interactives });
// this target owns the stdio half — print each served frame, read lines, map
// them onto the adapter's numbered interactives with the same event
// vocabulary every other target dispatches (`ui:click`, `ui:model`, `ui:key`).
//
// What a typed line does is ./commands.ts ("numbers act, words fill"), the
// focused input is ./focus.ts, what is said of the connection is ./link.ts.
// All of it is target policy: the wire, the server, and the apps never see
// anything but ordinary events.
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

export const ttyTarget = (config: TtyTargetConfig): Target => (api) => {
  const { input, output } = config;
  const view = createTtyView(config.registry ?? defaultRegistry(), api, { fallback: config.fallback ?? defaultFallback });
  const debounceMs = config.debounceMs ?? 80;
  const basePrompt = config.prompt ?? '› ';

  let last: TtyFrame = { text: '', interactives: [] };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const rl = createInterface({ input, output, prompt: basePrompt });
  const say = (text: string): void => void output.write(`${text}\n`);
  const focus = createFocus(rl, basePrompt);
  const reportLink = createLinkReport(say, () => rl.prompt(true));
  const checkStatus = (): void => {
    if (config.status !== undefined) reportLink(config.status());
  };

  const paint = (force = false): void => {
    const frame = view.render();
    const changed = frame.text !== last.text;
    last = frame;
    focus.follow(last.interactives, say);
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

  const repl = { api, say, interactives: () => last.interactives, focus, show: () => paint(true), quit: config.onQuit };
  rl.on('line', (raw: string) => {
    if (runLine(repl, raw)) rl.prompt();
  });
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
