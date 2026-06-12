import { parse, toNova } from '@niscorp/loom';
import { JsonViewer } from '@showroom/chrome/json-viewer';
import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { isLoomStory } from '../story-types';

// Definition — the Nova editor the story's schema renders to: the action plus
// any self-referencing templates (a recursive schema). The reveal: the Source
// tab shows the schema you author; this shows what Loom turns it into.
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
