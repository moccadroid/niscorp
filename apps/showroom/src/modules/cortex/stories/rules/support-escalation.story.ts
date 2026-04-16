import * as demo from './support-escalation.demo';
import source from './support-escalation.demo?raw';

export const story = {
  id: 'rules.sentiment-escalation',
  name: 'Sentiment escalation',
  description:
    'A support agent analyzes user sentiment via a tool. A rule watches the latest sentiment score from observations. When it drops below 0.3, the rule injects an escalation warning — and the agent visibly shifts to maximum empathy mode. The rule is pure JSON.',
  category: 'Declarative steering',
  kind: 'rules' as const,
  ...demo,
  source,
};
