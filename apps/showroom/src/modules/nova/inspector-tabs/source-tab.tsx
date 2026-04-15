import type { FC } from 'react';
import { CodeView } from '../../../chrome/code-view';
import type { Story } from '../story-types';

// Shows the story's `.demo.tsx` contents. The raw text is attached
// to the story in its `.story.ts` file via a `?raw` import — no
// filename magic, no side-car lookup.

const LEGEND = "The story's .demo.tsx file verbatim.";

const MISSING = '// This story has no .demo.tsx yet (still on the legacy shape).';

export const SourceTab: FC<{ story: Story }> = ({ story }) => (
  <CodeView legend={LEGEND} source={story.source === '' ? MISSING : story.source} />
);
