import type { Slide } from './talks';

export const SOLID_SLIDES: readonly Slide[] = [
  { slideId: 'slide.solid-title', title: 'Solid', tools: ['tools.integrations'], notes: ['[before: Install the Q&A, then Approve]', '[join: scan the code or type the address]', 'fifteen minutes on streaming JSON', 'join: pick a name or type one'] },
  { slideId: 'slide.solid-joined', title: 'Everyone who has joined', tools: [], notes: ['each name = a row in the database', '[wait until most people are in]'] },
  { slideId: 'slide.solid-timer', title: 'First, a timer.', tools: ['assistant.thread'], notes: ['[ask the assistant here on the controller — you watch it on the stage]', '[type: "Show the last slide in 15 minutes"]', '[read it out, press Save]'] },
  { slideId: 'slide.solid-brace', title: 'JSON isn’t JSON until its last brace.', tools: [], notes: ['a model streams its answer, token by token', 'halfway, it isn’t JSON yet', 'right: what JSON.parse says about it, run here', 'so you wait for the last brace — and show nothing until then'] },
  { slideId: 'slide.solid-arrives', title: 'Solid reads it as it arrives.', tools: ['tools.stream'], notes: ['[Write it]', 'left: the reply so far — never valid JSON until the end', 'right: what Solid holds — valid at every chunk', 'checked against the schema as it goes', 'a recorded reply, played at a model’s pace'] },
  { slideId: 'slide.solid-drawn', title: 'The screen draws while it’s written.', tools: ['tools.stream', 'tools.watcher'], notes: ['[give everybody the stream]', '[Write it] again', 'the title first, then each option as it’s known', 'your phones draw the same, as it arrives', 'nothing waits for the last brace'] },
  { slideId: 'slide.solid-end', title: 'It’s all in one folder.', tools: [], notes: ['[if the timer put this up] that was the timer — no model ran', 'everything you saw: one folder, open source', 'nisc.dev: every package, its guides, its reference', 'questions: in the Q&A, on your phone'] },
];
