// Every check, each in its own process over its own fresh database.
//
// Separate processes on purpose: the storm check MOVES the headliner, and a
// shared database would make the order of the suite part of its meaning. Each
// also binds its own fake decision provider on a free port, so the suite runs
// beside a live dev server without either noticing.
//
// Run: pnpm --filter encore check
import { spawnSync } from 'node:child_process';

const CHECKS = [
  ['decider-check', 'the fake provider speaks the System One wire, through signal\'s own adapter'],
  ['lanes-check', 'parse, derive and resolve, one pure lane at a time — hysteresis included'],
  ['boot-check', 'the app boots, the charter verifies, each principal gets their application'],
  ['storm-check', 'one sentence, typed into a real shell, assembles the room'],
  ['permission-check', 'an action a principal lacks is never a question'],
  ['forms-check', 'every write closes through the database, stamped by the engine'],
  ['typeover-check', 'a new sentence is a new room: typed over, never emptied — and the room answers, and says why'],
  ['assistant-check', 'the assistant runs on every finished sentence and on Enter, never mid-typing; a changed line aborts it; an empty answer shows nothing; it adds and aims, admitted whole, never over a touched field'],
  ['scenes-check', 'scenes 1–3 end to end: citations that light their cards, the rail, typed follow-ups, the impact card, exposure, a plan that ticks when a person presses the button'],
  ['watch-check', 'scene 4, nobody typing: every event triaged under a middling model, a burst is one pass, the sentence never waits, a click is a label, the liaison is never asked about an incident'],
  ['surface-check', 'three layers that never mix: with x-ray off no meta reaches the terminal, a card says why in a word, the switch remounts nothing, the drawer remembers what was open'],
  ['aim-check', 'the two models finish each other’s work: a card Jev wanted and could not aim is aimed by the assistant from the facts it read — an id from nowhere still rejects the answer — and x-ray says why every wanted card that is not up is not'],
  ['law-check','the agent never acts: its files cannot reach a shell or a write, and no run changes a row but its own thread'],
] as const;

let failed = 0;
for (const [name, what] of CHECKS) {
  console.log(`\n\x1b[1m── ${name}\x1b[0m — ${what}`);
  const run = spawnSync(process.execPath, ['--import', 'tsx', `src/dev/${name}.ts`], { stdio: 'inherit', shell: false });
  if (run.status !== 0) failed += 1;
}

console.log(failed === 0 ? `\n\x1b[32mAll ${CHECKS.length} checks pass.\x1b[0m` : `\n\x1b[31m${failed} of ${CHECKS.length} checks failed.\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
