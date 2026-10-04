import type { PrismExampleGroup } from './example.types';

// The groups the examples come in, in reading order, each with what it holds.
// Whoever shows the examples takes the grouping from here, so a group is named
// in one place. The operators are in the groups the reference (DOCS.md) puts
// them in, in the same order.
export type PrismExampleGroupInfo = {
  id: PrismExampleGroup;
  title: string;
  // One or two sentences: what the examples in the group have in common.
  description: string;
};

export const PRISM_EXAMPLE_GROUPS: readonly PrismExampleGroupInfo[] = [
  {
    id: 'core',
    title: 'Core',
    description:
      'Where the values in a config come from: what it was given, a value written out, or a name bound further up.',
  },
  {
    id: 'arrays',
    title: 'Arrays',
    description:
      'Going through a list: each element in turn, some of them, or all of them into one value.',
  },
  { id: 'math', title: 'Math', description: 'Arithmetic on two numbers, and rounding.' },
  {
    id: 'strings',
    title: 'Strings',
    description: 'Putting strings together and taking them apart.',
  },
  {
    id: 'predicates',
    title: 'Predicates',
    description: 'Comparisons and checks. Each gives true or false.',
  },
  { id: 'logic', title: 'Logic', description: 'Combining what is true: and, or, not.' },
  {
    id: 'structure',
    title: 'Structure',
    description: 'Choosing between values, and turning lists and objects into each other.',
  },
  {
    id: 'objects',
    title: 'Objects',
    description:
      'Taking an object apart: its keys, its values, some of them, and what kind of value something is.',
  },
  {
    id: 'transform',
    title: 'Transform',
    description:
      'Rewriting a document in place instead of deriving a value from it. Built for migrations: a config that returns what it was given with one exact edit.',
  },
  {
    id: 'time',
    title: 'Time',
    description: 'Dates as data: written in a format, moved, and measured.',
  },
  {
    id: 'locale',
    title: 'Locale',
    description: 'Values written the way a reader in a given language expects them.',
  },
  {
    id: 'sugar',
    title: 'Sugar',
    description:
      'Shorthands for what configs do most. Each is rewritten into the operators it stands for before a config is evaluated.',
  },
  {
    id: 'composition',
    title: 'Composition',
    description: 'Operators working together: templates, nesting, and naming a value once.',
  },
  {
    id: 'real-world',
    title: 'Real world',
    description: 'Whole configs, of the size an app writes.',
  },
];
