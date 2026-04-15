import type { FC } from 'react';
import { CodeView } from '../../../chrome/code-view';
import { getStorySource } from '../source-map';
import type { CortexStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Source tab — prints the authored story file plus the agent
// definition(s) it references, verbatim. Replaces the old
// code-tab.tsx whose per-demo template-string generators were
// drift-prone (when the authored story changed, the generated
// snippet did not).
// ═══════════════════════════════════════════════════════════

const LEGEND =
  "The authored story file + referenced agent definitions, verbatim. No drift: what you read is what runs.";

const MISSING =
  '// Source for this story id was not found. Ensure the story has an `id:` literal in a known file.';

type Props = { story: CortexStory };

export const SourceTab: FC<Props> = ({ story }) => {
  const src = getStorySource(story.id);
  return <CodeView legend={LEGEND} source={src === '' ? MISSING : src} />;
};
