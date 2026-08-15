import * as demo from './patterns.demo';
import source from './patterns.demo?raw';

export const story = {
  id: 'i18n-patterns',
  name: 'Counted phrases',
  description:
    '“12 of 20” has unbounded cardinality, so the PATTERN is the dictionary row and the holes close after it translates. Whole-pattern translation is what lets word order move — watch `{n} left` become `noch {n}`. String slots are vocabulary in their own right, so a composed sentence is several rows. And the holes close in the source language too: a component must never be handed a `{ phrase, slots }` to draw.',
  category: 'i18n',
  kind: 'i18n' as const,
  ...demo,
  source,
};
