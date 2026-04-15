import * as demo from './reduce.demo';
import source from './reduce.demo?raw';

export const story = {
  id: 'reduce',
  name: '$reduce',
  description: 'Folds an array into a single value via an accumulator. Both the current element and the accumulator are in scope inside `body`. Default accumulator name is "acc".',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
