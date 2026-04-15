import { createElement } from 'react';
import type { InspectorTabDef, Story } from '../../types';
import { isStreamDemoStory } from '../story-types';
import { JsonViewer } from '../../signal/chat/json-viewer';

// Chrome provides the Source tab. Solid adds Source JSON — the raw
// streaming payload the demo feeds through.
export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  if (!isStreamDemoStory(story)) return [];
  return [
    {
      id: 'json-source',
      label: 'Source JSON',
      render: () => createElement(JsonViewer, { value: JSON.parse(story.recipe.json) }),
    },
  ];
};
