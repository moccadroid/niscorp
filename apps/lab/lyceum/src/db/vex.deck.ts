import type { Slide } from './talks';

// THE VEX TALK — twenty minutes on one package, told the way the essay tells
// it: a model fills in a form, the engine writes the statement, the answer is
// stored under a name and replayed by anyone under their own rights. Data
// alone: the slides are actions in app/actions/slide/vex.actions.ts.
//
// In order. Notes are terse cues; actions in [brackets].
export const VEX_SLIDES: readonly Slide[] = [
  { slideId: 'slide.sixtools', title: 'Vex', tools: [], notes: ['[join: scan the code or type the address]', 'twenty minutes, one package', 'a model fills in a form, not a statement', 'join: pick a name or type one'] },
  { slideId: 'slide.joined', title: 'Everyone who has joined', tools: [], notes: ['each name = a row in the database', '[wait until most people are in]'] },
  {
    slideId: 'slide.writer',
    title: 'Watch it write one.',
    tools: ['tools.ask'],
    notes: ['[ask: who has asked the most questions?]', 'shown: the tables I may read + one line about me', 'every tool runs through the engine, as me', 'a test fails → the engine’s own message → fixed', 'finishes only with a draft that passed', 'stored under a name: replayed from now on'],
  },
  { slideId: 'slide.folder', title: 'It’s all in one folder.', tools: [], notes: ['everything you saw ran here', 'apps/lab/lyceum'] },
];
