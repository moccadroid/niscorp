import type { NovaEvent } from '@niscorp/nova';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import type { TerminalApi } from '../index';
import { sendFrom, tapEventOf } from '../numbered';
import type { Focus } from './focus';

export type Repl = {
  api: TerminalApi;
  say: (text: string) => void;
  interactives: () => readonly TtyInteractive[];
  focus: Focus;
  show: () => void;
  quit: (() => void) | undefined;
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

const act = (repl: Repl, interactive: TtyInteractive, event: NovaEvent): void => {
  if (!sendFrom(repl.api, interactive, event)) repl.say(`[${interactive.index}] is frame chrome — it dispatches nothing`);
};

const fill = (repl: Repl, interactive: TtyInteractive, value: string): void => act(repl, interactive, { type: 'ui:model', ref: interactive.ref, payload: value });

const tap = (repl: Repl, interactive: TtyInteractive): void => {
  const event = tapEventOf(interactive);
  if (event === undefined) repl.focus.enter(interactive);
  else act(repl, interactive, event);
};

const named = (repl: Repl, token: string | undefined, then: (target: TtyInteractive) => void): void => {
  const index = Number(token);
  const target = Number.isInteger(index) ? repl.interactives().find((item) => item.index === index) : undefined;
  if (target === undefined) repl.say(`no [${token ?? '?'}] on screen — try refs`);
  else then(target);
};

type Words = { second: string | undefined; rest: string };
type Command = (repl: Repl, words: Words) => void;

const refs: Command = (repl) => {
  if (repl.interactives().length === 0) repl.say('nothing actionable on screen');
  for (const item of repl.interactives()) {
    const where = item.canvas === '' ? 'frame' : item.canvas;
    repl.say(`[${item.index}] ${item.kind}  ${item.ref} @${where}  ${item.label}${item.path !== undefined ? `  (${item.path})` : ''}`);
  }
};

const publish: Command = (repl, { second, rest }) => {
  if (second === undefined) repl.say('usage: publish <channel> [json]');
  else if (rest === '') repl.api.publish(second);
  else {
    try {
      repl.api.publish(second, JSON.parse(rest));
    } catch {
      repl.api.publish(second, rest);
    }
  }
};

const set: Command = (repl, { second, rest }) =>
  named(repl, second, (target) => {
    if (target.kind === 'model') {
      if (rest === '') repl.focus.enter(target);
      else fill(repl, target, rest);
    } else if (target.kind === 'toggle') {
      if (rest === 'true' || rest === 'false') act(repl, target, { type: 'ui:model', ref: target.ref, payload: rest === 'true' });
      else repl.say(`[${target.index}] is a toggle — use: toggle ${target.index}`);
    } else repl.say(`[${target.index}] is not an input`);
  });

const toggle: Command = (repl, { second }) =>
  named(repl, second, (target) => {
    if (target.kind === 'toggle') tap(repl, target);
    else repl.say(`[${target.index}] is not a toggle`);
  });

const key: Command = (repl, { second, rest }) =>
  named(repl, second, (target) => {
    if (target.kind === 'model' && rest !== '') act(repl, target, { type: 'ui:key', ref: target.ref, key: rest });
    else repl.say('usage: key <n> <key> — on an input');
  });

// A Map, not an object: a typed `constructor` is a word, not a command.
const COMMANDS = new Map<string, Command>([
  ['help', (repl) => repl.say(HELP)],
  ['show', (repl) => repl.show()],
  ['refs', refs],
  ['publish', publish],
  ['set', set],
  ['toggle', toggle],
  ['key', key],
  ['click', (repl, { second }) => named(repl, second, (target) => tap(repl, target))],
]);

const fillOnlyInput = (repl: Repl, head: string, line: string): void => {
  const inputs = repl.interactives().filter((item) => item.kind === 'model');
  if (inputs.length === 1 && inputs[0] !== undefined) fill(repl, inputs[0], line);
  else if (inputs.length === 0) repl.say(`unknown command: ${head} — try help`);
  else repl.say(`several inputs on screen — pick one: ${inputs.map((item) => `[${item.index}]`).join(' ')}`);
};

export const runLine = (repl: Repl, raw: string): boolean => {
  if (repl.focus.held()) {
    const target = repl.focus.among(repl.interactives());
    if (raw !== '' && target !== undefined) fill(repl, target, raw);
    repl.focus.exit();
    return true;
  }
  const line = raw.trim();
  if (line === '') return true;
  const [head = '', second, ...restTokens] = line.split(/\s+/);
  if (head === 'quit' || head === 'exit') {
    if (repl.quit !== undefined) repl.quit();
    else repl.say('no quit handler — Ctrl+C to leave');
    return false;
  }
  const command = COMMANDS.get(head);
  if (command !== undefined) command(repl, { second, rest: restTokens.join(' ') });
  else if (/^\d+$/.test(head)) named(repl, head, (target) => tap(repl, target));
  else fillOnlyInput(repl, head, line);
  return true;
};
