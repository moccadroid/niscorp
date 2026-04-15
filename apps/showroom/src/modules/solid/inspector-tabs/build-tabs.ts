import { createElement } from 'react';
import type { InspectorTabDef } from '../../types';
import { isStreamDemoStory } from '../story-types';
import { CodeView } from '../../../chrome/code-view';
import { JsonViewer } from '../../signal/chat/json-viewer';
import { getStorySource } from '../stories/source-map';

// ═══════════════════════════════════════════════════════════
// Inspector tabs for solid stream-demo stories.
//
//   Source      — the story's own .ts file verbatim (no drift).
//   Source JSON — the demo's streaming payload, for reference.
// ═══════════════════════════════════════════════════════════

const SOURCE_LEGEND =
  "The story's own TypeScript source. Schema, initial, chunk config, everything as authored.";

const MISSING = '// Source file not found for this story id.';

export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (!isStreamDemoStory(story)) return [];

  const src = getStorySource(story.id);
  const source = src === '' ? MISSING : src;

  return [
    {
      id: 'source',
      label: 'Source',
      render: () => createElement(CodeView, { legend: SOURCE_LEGEND, source }),
    },
    {
      id: 'json-source',
      label: 'Source JSON',
      render: () => createElement(JsonViewer, { value: JSON.parse(story.recipe.json) }),
    },
  ];
};
