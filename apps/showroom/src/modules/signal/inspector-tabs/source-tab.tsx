import type { FC } from 'react';
import { CodeView } from '../../../chrome/code-view';
import { getStorySource } from '../stories/source-map';
import type { RecipeStory, StreamStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Source tab — prints the story's own .ts file verbatim.
// Replaces the old code-tab.tsx + stream-code-tab.tsx whose
// fallback generators composed TS source from the setup record
// (drift-prone). The authored file is the single source of
// truth: `setup`, `code`, `snapshot`, `expected` are all here.
// ═══════════════════════════════════════════════════════════

const LEGEND =
  "The story's own TypeScript source. Setup, schema, snapshot, everything as authored.";

const MISSING = '// Source file not found for this story id.';

type Props = { story: RecipeStory | StreamStory };

export const SourceTab: FC<Props> = ({ story }) => {
  const src = getStorySource(story.id);
  return <CodeView legend={LEGEND} source={src === '' ? MISSING : src} />;
};
