// WHAT TYPING FEELS LIKE, AS A TABLE. Not a check — it asserts nothing. It types
// one sentence into a real shell a keystroke at a time, at a human pace, against
// the fake decider slowed to a realistic round trip, and prints when each pass
// was sent, when it landed, how long its text had waited, and what the screen
// showed after it — plus what the instant lane had already put on the line.
//
//   pnpm --filter encore timeline                       # storm sentence, 150 ms/key, 300 ms provider
//   pnpm --filter encore timeline "sentence" 120 450    # ms per keystroke, provider latency
import { OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';
import { cardData, createWorld, mounted } from './world-factory';

const [sentenceArg, keyArg, latencyArg] = process.argv.slice(2);
const sentence = sentenceArg ?? 'storm at 9 move headliner to the tent';
const perKeyMs = Number(keyArg ?? 150);
const latencyMs = Number(latencyArg ?? process.env['ENCORE_DECIDER_LATENCY_MS'] ?? 300);

const world = await createWorld({ agent: { kind: 'off' }, decider: { latencyMs } });
const shell = await world.login(OPERATOR_PRINCIPAL);
await new Promise((resolve) => setTimeout(resolve, 200));

const room = (): string => QUESTION_CANVASES.flatMap((canvas) => mounted(shell, canvas)).join(', ') || '(empty)';
const heard = (): string => {
  const tags = cardData(shell, 'line', 'intent.line')['heard'];
  return (Array.isArray(tags) ? tags : []).map((tag) => (typeof tag === 'object' && tag !== null && 'label' in tag && 'state' in tag ? `${String(tag.label)}${tag.state === 'matched' ? '?' : ''}` : '')).join(' · ') || '—';
};

const origin = performance.now();
const at = (time: number): string => `${Math.round(time - origin)}`.padStart(5);
const keys: { at: number; text: string }[] = [];
const snapshots: { at: number; text: string; heard: string; room: string }[] = [];

for (let length = 1; length <= sentence.length; length += 1) {
  const text = sentence.slice(0, length);
  keys.push({ at: performance.now(), text });
  world.keystroke(OPERATOR_PRINCIPAL, text);
  await new Promise((resolve) => setTimeout(resolve, perKeyMs));
  snapshots.push({ at: performance.now(), text, heard: heard(), room: room() });
}
await world.settled(OPERATOR_PRINCIPAL);

console.log(`\n"${sentence}" — ${sentence.length} keystrokes at ${perKeyMs} ms, provider latency ${latencyMs} ms\n`);
console.log('  sent  landed  waited  text → room after it landed');
for (const pass of world.passesOf(OPERATOR_PRINCIPAL)) {
  console.log(`${at(pass.sentAt)}  ${at(pass.landedAt)}  ${pass.waitedMs.toFixed(0).padStart(6)}  "${pass.text}" → ${pass.top.filter((entry) => entry.p >= 0.8).map((entry) => entry.id).join(', ') || '(nothing sure)'}`);
}
console.log(`\n${world.passesOf(OPERATOR_PRINCIPAL).length} passes for ${sentence.length} keystrokes; last keystroke at ${at(keys.at(-1)?.at ?? origin)} ms, room final at ${at(world.passesOf(OPERATOR_PRINCIPAL).at(-1)?.landedAt ?? origin)} ms.`);

console.log('\n  the screen, one keystroke-interval after each word ended:');
for (const shot of snapshots.filter((entry, index) => entry.text.endsWith(' ') || index === snapshots.length - 1)) {
  console.log(`${at(shot.at)}  "${shot.text.trim()}"\n         heard: ${shot.heard}\n         room:  ${shot.room}`);
}
console.log(`\n  settled: heard ${heard()} · room ${room()}`);
await world.close();
process.exit(0);
