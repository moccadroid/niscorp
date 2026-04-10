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
  id: string;       // 'readme' | 'design' | 'playground' | 'settings' | ...
  title: string;    // sidebar label
  // Exactly one of these is set per page:
  content?: string;             // markdown source — rendered via MarkdownPane
  render?: () => ReactNode;     // interactive functional page (playground, settings, etc.)
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
  /**
   * Optional: subscribe to status-changed events. The chrome calls
   * this once when the library becomes active, passing a callback
   * the module can invoke whenever the sidebar dots should update
   * (e.g. after a run completes and history was persisted). Returns
   * an unsubscribe function. Modules that have static evaluation
   * (Prism, Signal, Nova) don't need this. Cortex uses it because
   * its dots come from a localStorage-backed run history.
   */
  subscribeStatusChange?: (callback: () => void) => () => void;
};
