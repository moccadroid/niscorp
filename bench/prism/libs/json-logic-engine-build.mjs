import { LogicEngine } from 'json-logic-engine';
import { tasksOf } from './json-logic-engine.shared.mjs';

const engine = new LogicEngine();

export default {
  id: 'json-logic-engine-build',
  name: 'json-logic-engine (build)',
  package: 'json-logic-engine',
  transform: 'json',
  usesEval: true,
  prepared: true,
  notes: 'engine.build on one LogicEngine at its defaults: the rule becomes JavaScript source that is run through eval (compiler.js, processBuiltString), so it needs a host that allows eval. oneShot is build and one call. The engine keeps nothing between builds.',
  prepare: (rule) => engine.build(rule),
  run: (built, input) => built(input),
  oneShot: (rule, input) => engine.build(rule)(input),
  tasks: tasksOf(),
};
