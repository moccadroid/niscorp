import { useMemo, type FC } from 'react';
import type { Story } from '@showroom/modules/types';
import { CodeView } from '@showroom/chrome/code-view';
import { extractCalls } from './extract-blocks';

// ═══════════════════════════════════════════════════════════
// Rules tab — for rules-kind stories, show the LIVE source of
// every `defineRule({...})` call made in the demo file.
//
// Rules are defined inline in the demo file (each rule IS the
// scenario). We scan `story.source` (the demo's ?raw text) for
// `defineRule({...})` calls and slice each one out with its
// enclosing `const X = ` prefix. No facsimiles.
// ═══════════════════════════════════════════════════════════

const LEGEND = "The defineRule({...}) calls that steer this story's agent.";

export const RulesTab: FC<{ story: Story }> = ({ story }) => {
  const blocks = useMemo(
    () => extractCalls(story.source, 'defineRule'),
    [story.source],
  );

  if (blocks.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: '#9ca3af' }}>
        This story doesn't define any rules.
      </div>
    );
  }

  const combined = blocks.map((b) => b.source).join('\n\n');
  return <CodeView legend={LEGEND} source={combined} />;
};
