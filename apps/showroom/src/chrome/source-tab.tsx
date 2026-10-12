import type { FC } from 'react';
import { CodeView } from './code-view';
import type { Story } from '@showroom/modules/types';

const LEGEND = "The story's demo source.";

const MISSING = '// No source attached to this story.';

export const SourceTab: FC<{ story: Story }> = ({ story }) => (
  <CodeView legend={LEGEND} source={story.source === '' ? MISSING : story.source} />
);
