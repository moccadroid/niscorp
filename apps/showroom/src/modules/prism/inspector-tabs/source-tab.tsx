import type { FC } from 'react';
import { CodeView } from '../../../chrome/code-view';
import { getStorySource } from '../stories/source-map';
import type { PrismStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Source tab — prints the story's own .ts file verbatim.
// For prism, the Input and Config already appear in the canvas
// pane; this tab adds the authored file for context (imports,
// fixture data, expected shapes as actually written).
// ═══════════════════════════════════════════════════════════

const LEGEND =
  "The story's own TypeScript source. Imports, input, config, expected — everything as authored.";

const MISSING = '// Source file not found for this story id.';

type Props = { story: PrismStory };

export const SourceTab: FC<Props> = ({ story }) => {
  const src = getStorySource(story.id);
  return <CodeView legend={LEGEND} source={src === '' ? MISSING : src} />;
};
