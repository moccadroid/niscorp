import { createElement } from 'react';
import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { JsonViewer } from '@showroom/chrome/json-viewer';

export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  const json = story['json'];
  if (typeof json !== 'string') return [];
  return [
    {
      id: 'json-source',
      label: 'Source JSON',
      render: () => createElement(JsonViewer, { value: JSON.parse(json) }),
    },
  ];
};
