import * as demo from './ui-card.demo';
import source from './ui-card.demo?raw';

export const story = {
  id: 'ui-card',
  name: 'Generated UI card',
  description:
    "The model returns a structured Card object — title, body, badges, action buttons — and signal renders it as an actual UI card in the chat. Structured output isn't just data: it's a UI generator.",
  category: 'Shaping',
  kind: 'recipe' as const,
  ...demo,
  source,
};
