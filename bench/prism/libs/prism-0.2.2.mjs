import * as lib from 'prism-published';
import { rowsOf, tasksOf } from './prism.shared.mjs';

export default {
  id: 'prism-0.2.2',
  name: 'Prism 0.2.2 (compile, execute)',
  package: '@niscorp/prism',
  transform: 'json',
  usesEval: false,
  prepared: true,
  notes: 'The version on npm before this work. Same configs.',
  ...rowsOf(lib).compiled,
  tasks: tasksOf(),
};
