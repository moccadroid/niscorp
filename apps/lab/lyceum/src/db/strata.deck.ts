import type { Slide } from './talks';

export const STRATA_SLIDES: readonly Slide[] = [
  { slideId: 'slide.strata-title', title: 'Strata', tools: ['tools.integrations'], notes: ['[before: Install the Q&A, then Approve]', '[join: scan the code or type the address]', 'fifteen minutes on what happens to stored documents', 'join: pick a name or type one'] },
  { slideId: 'slide.strata-joined', title: 'Everyone who has joined', tools: [], notes: ['each name = a row in the database', '[wait until most people are in]'] },
  { slideId: 'slide.strata-timer', title: 'First, a timer.', tools: ['assistant.thread'], notes: ['[ask the assistant here on the controller — you watch it on the stage]', '[type: "Show the last slide in 15 minutes"]', 'that timer is a document too — stored', '[read it out, press Save]'] },
  { slideId: 'slide.strata-problem', title: 'Your components change. Your stored screens don’t.', tools: [], notes: ['a model wrote a screen; you stored it', 'then you rename a prop, change what a value means', 'every stored screen is now wrong', 'tables have migrations — documents need them too'] },
  { slideId: 'slide.strata-read', title: 'Upgraded when it’s read.', tools: [], notes: ['left: a screen stored when Look named a kit — poster or plain', 'right: the same screen read now, through this app’s grammars', 'every migration since, in order — marked: what changed', 'nothing rewrote the row: it’s upgraded on the way out', 'run here, just now'] },
  { slideId: 'slide.strata-list', title: 'Grammars get migrations.', tools: [], notes: ['this app’s own components, every change in order', 'additions need no steps', 'marked: the one that rewrote what was already written', 'a grammar change without a migration → the check refuses it'] },
  { slideId: 'slide.strata-newer', title: 'Newer than the code: refused.', tools: [], notes: ['a document stamped one version ahead', 'older code can’t know what it means', 'refused, not guessed', 'run here, just now'] },
  { slideId: 'slide.strata-end', title: 'It’s all in one folder.', tools: [], notes: ['[if the timer put this up] that was the timer — no model ran', 'everything you saw: one folder, open source', 'nisc.dev: every package, its guides, its reference', 'questions: in the Q&A, on your phone'] },
];
