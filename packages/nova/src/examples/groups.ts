import type { NovaExampleGroup } from './example.types';

export type NovaExampleGroupInfo = {
  id: NovaExampleGroup;
  title: string;
  description: string;
};

export const NOVA_EXAMPLE_GROUPS: readonly NovaExampleGroupInfo[] = [
  {
    id: 'layouts',
    title: 'Layouts',
    description: "How a layout becomes a screen: paths, templates, conditions and loops, each resolved against the action's data.",
  },
  {
    id: 'actions',
    title: 'Actions',
    description: 'An action is data, a layout over it, and triggers that change the data when something is pressed.',
  },
  {
    id: 'endpoints',
    title: 'Endpoints',
    description: 'How an action reaches outside itself: a named call, where its answer lands, and what happens when it fails.',
  },
  {
    id: 'composition',
    title: 'Composition',
    description: 'Fragments: a frame and its behaviour kept once, and put around an action by whoever opens it.',
  },
  {
    id: 'shells',
    title: 'Shells',
    description: 'Canvases, what stands on them, and how actions move between them and speak to each other.',
  },
  {
    id: 'i18n',
    title: 'i18n',
    description: 'Words in the reader’s language: a book keyed on the words as they are written, and rules for which strings are words at all.',
  },
];
