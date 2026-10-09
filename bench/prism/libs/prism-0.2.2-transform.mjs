import * as lib from 'prism-published';
import { rowsOf, tasksOf } from './prism.shared.mjs';

export default {
  id: 'prism-0.2.2-transform',
  name: 'Prism 0.2.2 (prismTransform)',
  package: '@niscorp/prism',
  transform: 'json',
  usesEval: false,
  prepared: true,
  notes: 'The version on npm before this work, through prismTransform.',
  ...rowsOf(lib).transform,
  tasks: tasksOf(),
};
