import { createElement } from 'react';
import type { InspectorTabDef } from '../../types';
import { isStreamDemoStory } from '../story-types';
import { CodeView } from '../../../chrome/code-view';
import { JsonViewer } from '../../signal/chat/json-viewer';

const CODE_LEGEND = 'Copy/paste this into your project. Install @niscorp/solid and zod, then run.';

const generateFallback = (json: string): string => {
  return `import { createStream } from '@niscorp/solid';
import { z } from 'zod';

const stream = createStream({ schema, initial });

stream.on((value) => {
  console.log(value);
});

for await (const chunk of llmStream) {
  stream.write(chunk);
}
stream.close();`;
};

export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (!isStreamDemoStory(story)) return [];

  const code = story.code ?? generateFallback(story.demo.json);

  return [
    {
      id: 'code',
      label: 'Code',
      render: () => createElement(CodeView, { legend: CODE_LEGEND, source: code }),
    },
    {
      id: 'json-source',
      label: 'Source JSON',
      render: () => createElement(JsonViewer, { value: JSON.parse(story.demo.json) }),
    },
  ];
};
