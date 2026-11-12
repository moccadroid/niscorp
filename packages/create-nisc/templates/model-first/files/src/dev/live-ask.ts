import { existsSync } from 'node:fs';
import type { SignalClient } from '@niscorp/cortex';
import type { Chat } from '../server/compose';
import { modelsFromEnv } from '../server/models';
import { startApp } from './scripted';
import type { Shown } from './scripted';

// A turn as the person sees it: the sentence, and the cards under it.
type Turn = { reply: string; cards: Shown[] };
// A case: a message, and what the turn it gets must be; a case that follows on from the one before it says so.
type Case = { ask: string; want: (turn: Turn) => string | undefined; follows?: boolean };

const shows = (action: string) => (turn: Turn): string | undefined => (turn.cards.some((card) => card.action === action) ? undefined : `want ${action}`);
const twice = (turn: Turn): string | undefined => {
  const seen = turn.cards.map((card) => JSON.stringify([card.action, card.data]));
  return new Set(seen).size === seen.length ? undefined : 'the same card is shown twice';
};

const CASES: readonly Case[] = [
  { ask: 'What is an action?', want: shows('guide.actions') },
  { ask: 'Who may do what?', want: shows('guide.charter') },
  { ask: 'How is my message answered?', want: shows('guide.answers') },
  { ask: 'How do reads work?', want: shows('guide.data') },
  { ask: 'and what is the shell?', want: shows('guide.shell'), follows: true },
  { ask: 'A counter that starts at 100', want: (turn) => (turn.cards.some((card) => card.action === 'guide.counter' && card.data['count'] === 100) ? undefined : 'want a counter at 100') },
  { ask: 'A checklist for my first nisc app', want: (turn) => (turn.cards.some((card) => card.action === 'guide.checklist' && Array.isArray(card.data['todo']) && card.data['todo'].length > 0) ? undefined : 'want a checklist with steps') },
  { ask: 'Quiz me on the charter', want: shows('guide.quiz') },
  { ask: 'What is the weather in Vienna?', want: (turn) => (turn.reply !== '' && !turn.reply.startsWith('I could not') && turn.cards.every((card) => card.action === 'answer.text') ? undefined : 'want a sentence and no card: nothing here shows the weather') },
];

const prompts = process.argv.includes('--prompts');
const why = prompts || process.argv.includes('--why');
const runs = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.slice('--runs='.length) ?? 1);
const own = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const cases: readonly Case[] = own.length > 0 ? own.map((ask) => ({ ask, want: () => undefined, follows: true })) : CASES;

if (existsSync('.env')) process.loadEnvFile('.env');
const models = modelsFromEnv(process.env);
if (models.chat === undefined) {
  console.log(`Set ${models.missing.join(' and ')} in .env: live-ask asks the real model.`);
  process.exit(1);
}
const said: string[] = [];
const told = (llm: SignalClient): SignalClient => ({
  ...llm,
  stepStream: (request, options) =>
    (async function* () {
      if (prompts) said.push(request.messages.map((message) => `──── ${message.role.toUpperCase()}\n${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`).join('\n'));
      for await (const event of llm.stepStream(request, options)) {
        if (event.type === 'done') said.push(`  model: ${event.result.content}`);
        yield event;
      }
    })(),
});
const chat: Chat = { ...models.chat, llm: told(models.chat.llm) };

const times: number[] = [];
let missed = 0;
for (let run = 1; run <= runs; run += 1) {
  console.log(`\n═══ run ${String(run)}`);
  let app = await startApp({ chat, missing: [] }, 60_000);
  let right = 0;
  try {
    for (const one of cases) {
      // A case that does not follow on is asked in a conversation of its own.
      if (one.follows !== true) {
        app.server.close();
        app = await startApp({ chat, missing: [] }, 60_000);
      }
      const before = app.on('talk').length;
      const took = await app.ask(one.ask);
      if (took !== undefined) times.push(took);
      const added = app.on('talk').slice(before);
      const turn: Turn = { reply: String(added[0]?.data['reply'] ?? ''), cards: added.slice(1) };
      const miss = took === undefined ? 'no answer in 60 s' : (twice(turn) ?? one.want(turn));
      if (miss === undefined) right += 1;
      else missed += 1;
      console.log(`» "${one.ask}" — ${String(Math.round(took ?? 0))} ms ${miss === undefined ? '✓' : `✗ ${miss}`}\n  ${turn.reply}\n${turn.cards.map((card) => `  ${card.action}`).join('\n')}`);
      if (why) console.log(said.join('\n'));
      said.length = 0;
    }
  } finally {
    app.server.close();
  }
  console.log(`run ${String(run)}: ${String(right)}/${String(cases.length)} right`);
}

const sorted = [...times].sort((one, other) => one - other);
console.log(`\n${String(times.length)} messages · median ${String(Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0))} ms · slowest ${String(Math.round(sorted[sorted.length - 1] ?? 0))} ms · ${String(missed)} missed`);
process.exit(missed === 0 ? 0 : 1);
