import * as demo from './merge-rules.demo';
import source from './merge-rules.demo?raw';

export const story = {
  id: 'compose-merge-rules',
  name: 'Merge rules (action wins)',
  description:
    'Composition merges more than layout. `data` merges `{ ...fragment, ...action }` — the action wins on conflict (the title shows the action’s value, not the fragment’s “Untitled”). `triggers` concatenate — the fragment’s ★ Star and the action’s 👍 Like both fire on the one merged instance. Endpoints merge action-wins; lifecycle hooks concat fragment-first.',
  category: 'Composition',
  kind: 'action' as const,
  ...demo,
  source,
};
