import * as lib from '../../../packages/prism/dist/index.js';
import { rowsOf, tasksOf } from './prism.shared.mjs';

export default {
  id: 'prism-transform',
  name: 'Prism (evaluate)',
  package: '@niscorp/prism',
  transform: 'json',
  usesEval: false,
  prepared: true,
  notes: 'This repository build, as a host calls it: evaluate with the config object it holds. run passes the same config object again; oneShot passes a new object each call.',
  ...rowsOf(lib).transform,
  tasks: tasksOf(),
};
