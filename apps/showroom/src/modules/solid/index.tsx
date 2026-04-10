import type { FC } from 'react';
import type { LibraryModule, SidebarStoryEntry } from '../types';
import { stories } from './stories';
import { isStreamDemoStory } from './story-types';
import { Runner } from './runner';
import { evaluateAll } from './evaluators';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';

import readmeContent from '../../../../../packages/solid/README.md?raw';
import designContent from '../../../../../packages/solid/DESIGN.md?raw';

const toSidebarEntry = (story: unknown): SidebarStoryEntry => {
  if (!isStreamDemoStory(story)) return { id: '?', name: '?', description: '', category: '', kind: '' };
  return {
    id: story.id,
    name: story.name,
    description: story.description,
    category: story.category,
    kind: story.kind,
  };
};

const NoopProvider: FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export const solidModule: LibraryModule = {
  id: 'solid',
  name: 'Solid',
  stories,
  toSidebarEntry,
  kindOrder: ['stream-demo'],
  kindLabels: { 'stream-demo': 'Streaming Demos' },
  evaluateAll,
  RuntimeProvider: NoopProvider,
  Runner,
  buildInspectorTabs,
  docs: [
    { id: 'readme', title: 'README', content: readmeContent },
    { id: 'design', title: 'Design', content: designContent },
  ],
};
