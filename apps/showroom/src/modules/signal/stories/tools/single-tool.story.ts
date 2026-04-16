import * as demo from './single-tool.demo';
import source from './single-tool.demo?raw';

export const story = {
  id: 'single-tool',
  name: 'Single tool call',
  description:
    "The model decides to call a tool, signal runs it, and the model continues with the result. The full roundtrip lives in result.history; tool execution metadata is in result.meta.toolCalls.",
  category: 'Tools',
  kind: 'recipe' as const,
  ...demo,
  source,
};
