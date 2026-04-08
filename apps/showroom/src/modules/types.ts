import type { ComponentType, ReactNode } from 'react';

export type SidebarStoryEntry = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: string;
};

export type DotColor = 'gray' | 'green' | 'red';

export type StatusMap = Record<string, DotColor>;

export type InspectorTabDef = {
  id: string;
  label: string;
  render: () => ReactNode;
};

export type DocPage = {
  id: string;       // 'readme' | 'design' | 'context' | ...
  title: string;    // sidebar label
  content: string;  // markdown source
};

export type LibraryModule = {
  id: string;
  name: string;
  stories: readonly unknown[];
  toSidebarEntry: (story: unknown) => SidebarStoryEntry;
  kindOrder: readonly string[];
  kindLabels: Record<string, string>;
  evaluateAll: (stories: readonly unknown[]) => Promise<StatusMap>;
  RuntimeProvider: ComponentType<{ children: ReactNode }>;
  Runner: ComponentType<{ story: unknown }>;
  buildInspectorTabs: (story: unknown) => InspectorTabDef[];
  docs?: readonly DocPage[];
};
