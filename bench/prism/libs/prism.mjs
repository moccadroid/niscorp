import * as lib from '../../../packages/prism/dist/index.js';
import { rowsOf, tasksOf } from './prism.shared.mjs';

export default {
  id: 'prism',
  name: 'Prism (compile, execute)',
  package: '@niscorp/prism',
  transform: 'json',
  usesEval: false,
  prepared: true,
  notes: 'This repository build. prepare is compile (check, desugar, optimize, fingerprint); run is execute; oneShot is evaluate with a new config object each call.',
  ...rowsOf(lib).compiled,
  tasks: tasksOf(),
};
