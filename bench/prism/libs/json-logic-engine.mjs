import { LogicEngine } from 'json-logic-engine';
import { tasksOf } from './json-logic-engine.shared.mjs';

const engine = new LogicEngine();

export default {
  id: 'json-logic-engine',
  name: 'json-logic-engine (interpreted)',
  package: 'json-logic-engine',
  transform: 'json',
  usesEval: false,
  // The harness reads `prepared: true` as: a host that keeps the same rule object pays `run`. That is this engine's
  // case, although it has no prepare call: it plans a rule object the first time it sees it.
  prepared: true,
  prepareTimed: false,
  notes: 'engine.run on one LogicEngine at its defaults. There is no call that prepares a rule for the interpreter, but the engine itself keeps a plan for each rule object it has seen (a WeakMap on the object), so run on the same object reuses it and oneShot, handed a fresh copy, plans again; after 500 unseen objects in a row the engine turns that planning off for good.',
  prepare: (rule) => rule,
  run: (rule, input) => engine.run(rule, input),
  oneShot: (rule, input) => engine.run(rule, input),
  tasks: tasksOf(),
};
