import { parse, toNova } from '@niscorp/loom';
import { JsonViewer } from '@showroom/chrome/json-viewer';
import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { isLoomStory } from '../story-types';

export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  if (!isLoomStory(story)) return [];
  const { schema } = story;
  if (schema === undefined) return [];
  return [
    {
      id: 'definition',
      label: 'Definition',
      render: () => <JsonViewer value={toNova(parse(schema))} />,
    },
  ];
};
