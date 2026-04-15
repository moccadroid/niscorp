import type { StreamDemoStory } from '../story-types';
import * as recipe from './scoped-errors.recipe';

export const scopedErrorsStory: StreamDemoStory = {
  id: 'scoped-errors',
  name: 'Scoped error observation',
  description: 'select().onError() fires only for errors at-or-below its path. Each part of the UI handles its own stream errors independently.',
  category: 'Validation',
  kind: 'stream-demo',
  pitch: {
    headline: 'Each component owns its errors.',
    body: "In a real app, the widget header and the data table are rendered by different components. If the LLM hallucinates a field in the widget, the table component shouldn't care — and it doesn't. select('widget').onError() fires for widget errors only. select('table').onError() fires for table errors only. No central error bus, no filtering logic, no cross-talk.",
  },
  recipe,
  showModeSwitcher: true,
};
