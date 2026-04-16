import * as demo from './action-suggestions.demo';
import source from './action-suggestions.demo?raw';

export const story = {
  id: 'action-suggestions',
  name: 'Reply + suggested actions',
  description:
    'A conversational reply plus a typed list of follow-up suggestions. Hook the suggestions up to your compose box and you have a guided chat in 20 lines.',
  category: 'Shaping',
  kind: 'recipe' as const,
  ...demo,
  source,
};
