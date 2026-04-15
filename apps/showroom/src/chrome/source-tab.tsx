import type { FC } from 'react';
import { CodeView } from './code-view';
import type { Story } from '../modules/types';

// ═══════════════════════════════════════════════════════════
// Chrome-owned Source tab.
//
// Every Story carries a `source` string (the authored .demo/.recipe
// file contents). Chrome injects this tab automatically into the
// inspector panel for every story, alongside any extra tabs a module
// contributes via buildInspectorTabs.
// ═══════════════════════════════════════════════════════════

const LEGEND = "The story's demo source.";

const MISSING = '// No source attached to this story.';

export const SourceTab: FC<{ story: Story }> = ({ story }) => (
  <CodeView legend={LEGEND} source={story.source === '' ? MISSING : story.source} />
);
