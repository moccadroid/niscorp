// WHAT THE REAL MODEL ACTUALLY SAID. Not a check: it needs a key and a network,
// and it asserts nothing. It types one sentence into a real shell with the
// decider pointed at TypeSafe and prints every question beside its answer —
// which is the only honest way to tune a description, a candidate label or a
// threshold. The fake provider answers the words; this answers the meaning.
//
//   pnpm --filter encore probe "storm at 9 move headliner to the tent"
import { OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { createWorld } from './world-factory';
import type { DecidedPass } from '@encore/server/intent/loop';

const line = process.argv.slice(2).join(' ').trim() || 'storm at 9 move headliner to the tent';
const seen: DecidedPass[] = [];

const world = await createWorld({
  agent: { kind: 'off' },
  decider: { kind: 'typesafe' },
  onDecided: (_principal, decided) => seen.push(decided),
});

await world.login(OPERATOR_PRINCIPAL);
await world.typeLine(OPERATOR_PRINCIPAL, line);
await world.settled(OPERATOR_PRINCIPAL);

const last = seen[seen.length - 1];
if (last === undefined) throw new Error('jev-probe: no pass was decided');

const percent = (value: number): string => `${Math.round(value * 100)}%`.padStart(4);

console.log(`\n"${last.text}" — ${Object.keys(last.questions).length} questions\n`);
for (const [name, question] of Object.entries(last.questions)) {
  const answer = last.answers[name];
  if (answer === undefined) continue;
  if (answer.kind === 'noul') console.log(`${percent(answer.p)}  ${name}`);
  if (answer.kind === 'score') console.log(`  L${answer.level}  ${name}  (confidence ${percent(answer.confidence).trim()})`);
  if (answer.kind === 'choice') {
    const label = question.type === 'choice' ? (question.criteria[answer.choice] ?? '') : '';
    console.log(`${percent(answer.confidence)}  ${name} = ${answer.choice}  ${label}`);
    const spread = Object.entries(answer.probabilities ?? {}).filter(([, p]) => p >= 0.05).sort((a, b) => b[1] - a[1]);
    if (spread.length > 1) console.log(`        ${spread.map(([option, p]) => `${option} ${percent(p).trim()}`).join(' · ')}`);
  }
}

const record = world.passesOf(OPERATOR_PRINCIPAL).at(-1);
if (record !== undefined) console.log(`\ndecide ${record.lanes.decide.toFixed(0)} ms · total ${record.totalMs.toFixed(0)} ms · ${record.requestBytes} bytes`);

// IS THE CONNECTION STAYING WARM? The same sentence again, twice, six seconds
// apart — longer than Node's default fetch holds an idle socket. With
// keep-warm.ts installed (boot does it) every `decide` lane below should be a
// round trip plus server time (~300 ms from here) and say `reused`; if they say
// `new` and cost 750 ms or more, the dispatcher is not the one fetch is using.
// The first pass above rode the socket boot's pre-warm opened — or paid for it.
const GAP_MS = 6_000;
const REPEATS = 2;
const lane = (label: string): void => {
  const pass = world.passesOf(OPERATOR_PRINCIPAL).at(-1);
  if (pass !== undefined) console.log(`${label.padEnd(18)} decide ${pass.lanes.decide.toFixed(0).padStart(5)} ms · connection ${pass.reusedConnection ? 'reused' : 'new'} · waited ${pass.waitedMs.toFixed(0)} ms`);
};
console.log('');
lane('pass 1');
for (let repeat = 0; repeat < REPEATS; repeat += 1) {
  await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  // The same sentence, give or take a trailing space — so each repeat is one
  // pass, sent the moment it is typed.
  await world.typeLine(OPERATOR_PRINCIPAL, repeat % 2 === 0 ? `${line} ` : line);
  lane(`after ${GAP_MS / 1000} s idle`);
}
await world.close();
process.exit(0);
