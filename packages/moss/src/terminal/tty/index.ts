import { createInterface } from 'node:readline';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyComponent, TtyFrame } from '@niscorp/nova/adapters/tty';
import { defaultRegistry, fallback as defaultFallback } from '@niscorp/nova/adapters/tty/components';
import type { ComponentRegistry } from '@niscorp/nova';
import type { WireStatus } from '../../client';
import { STATUS_WORDS } from '../targets';
import type { Target } from '../index';
import { runLine } from './commands';
import { createFocus } from './focus';

const createLinkReport = (say: (text: string) => void, prompt: () => void): ((now: WireStatus) => void) => {
  let link: 'unknown' | 'up' | 'down' | 'incompatible' = 'unknown';
  return (now) => {
    if (now === 'incompatible') {
      if (link !== 'incompatible') say(STATUS_WORDS.incompatible);
      link = 'incompatible';
      return;
    }
    if (now === 'open' && link !== 'up') {
      link = 'up';
      say(STATUS_WORDS.connected);
      prompt();
    } else if (now !== 'open' && link === 'up') {
      link = 'down';
      say(STATUS_WORDS.lost);
      prompt();
    } else if (link === 'unknown') {
      link = 'down';
      say(STATUS_WORDS.connecting);
    }
  };
};

export type TtyTargetConfig = {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  registry?: ComponentRegistry<TtyComponent>;
  fallback?: TtyComponent;
  onQuit?: () => void;
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
  const checkStatus = (): void => reportLink(api.status());

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
