import { createElement } from 'react';
import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { JsonViewer } from '@showroom/chrome/json-viewer';

// Chrome provides the Source tab. Solid adds Source JSON — the raw
// streaming payload the demo feeds through. `json` rides along on
// the story via the demo module's `...demo` spread.
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
