import * as demo from './weather-multi-city.demo';
import source from './weather-multi-city.demo?raw';

export const story = {
  id: 'tool-use.weather.happy',
  name: 'Weather (multi-city)',
  description:
    'Cortex tool loop in action. The user mentions two cities; the agent calls the weather tool twice, observes the results, and finalizes a structured report. Watch the live tool timeline.',
  category: 'Multi-step tool use',
  kind: 'tool-use' as const,
  ...demo,
  source,
};
