import type { ComponentType, FC, ReactNode } from 'react';

export type Story = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: string;
  Demo: FC;
  source: string;
  doc?: boolean;
  [extra: string]: unknown;
};

export type InspectorTabDef = {
  id: string;
  label: string;
  render: () => ReactNode;
};

export type DocPage = {
  id: string;
  title: string;
  content?: string;          // markdown
  render?: () => ReactNode;
};

export type LibraryModule = {
  id: string;
  name: string;
  stories: readonly Story[];
  kindOrder: readonly string[];
  kindLabels: Record<string, string>;
  buildInspectorTabs?: (story: Story) => InspectorTabDef[];
  RuntimeProvider?: ComponentType<{ children: ReactNode }>;
  docs?: readonly DocPage[];
};
