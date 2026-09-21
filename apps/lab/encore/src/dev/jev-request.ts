// THE EXACT BYTES. Writes the request body a pass sends to the decision
// provider for one sentence — `{ model, state, questions }`, as the System One
// wire takes it — so it can be read, measured and replayed with curl. Runs on
// the fake provider: deriving the questions needs the world, not the key.
//
//   pnpm --filter encore request "storm at 9 move headliner to the tent" > body.json
import { OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { PINNED_CLOCK } from '@encore/lib/festival-clock';
import { parseLine } from '@encore/server/intent/parse';
import { createWorld } from './world-factory';
import type { DecidedPass } from '@encore/server/intent/loop';

const line = process.argv.slice(2).join(' ').trim() || 'storm at 9 move headliner to the tent';
const seen: DecidedPass[] = [];
const world = await createWorld({ agent: { kind: 'off' }, onDecided: (_principal, decided) => seen.push(decided) });

await world.login(OPERATOR_PRINCIPAL);
await world.typeLine(OPERATOR_PRINCIPAL, line);
await world.settled(OPERATOR_PRINCIPAL);

const last = seen[seen.length - 1];
if (last === undefined) throw new Error('jev-request: no pass was decided');

const parsed = parseLine(last.text, PINNED_CLOCK);
const heard = {
  ...(parsed.time !== undefined ? { time: parsed.time } : {}),
  ...(parsed.day !== undefined ? { day: parsed.day } : {}),
  ...(parsed.minutes !== undefined ? { minutes: parsed.minutes } : {}),
  ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
};
process.stdout.write(JSON.stringify({ model: 'jev-latest', state: { line: last.text, heard }, questions: last.questions }));
await world.close();
process.exit(0);
