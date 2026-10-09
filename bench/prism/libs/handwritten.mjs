// The ceiling: each task as a plain function, written by hand. It is the task's own reference (tasks.mjs), so it
// is right by definition; no library should be expected to beat it.

import { TASKS } from '../tasks.mjs';

export default {
  id: 'handwritten',
  name: 'A function written by hand',
  package: null,
  transform: 'code',
  usesEval: false,
  prepared: false,
  notes: 'Not a transform a user can store or an LLM can be handed a schema for: it is code. Here as the ceiling.',
  prepare: (source) => source,
  run: (fn, input) => fn(input),
  oneShot: (fn, input) => fn(input),
  // structuredClone cannot carry a function, so the source is its text and the function is found by task id.
  tasks: Object.fromEntries(
    TASKS.map((task) => [
      task.id,
      { source: task.reference.toString(), prepare: () => task.reference, oneShot: (_source, input) => task.reference(input) },
    ]),
  ),
};
