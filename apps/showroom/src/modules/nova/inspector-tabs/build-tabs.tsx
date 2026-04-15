import type { InspectorTabDef } from '../../types';
import { isStory } from '../story-types';
import { SourceTab } from './source-tab';

export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (!isStory(story)) return [];
  return [{ id: 'source', label: 'Source', render: () => <SourceTab story={story} /> }];
};
