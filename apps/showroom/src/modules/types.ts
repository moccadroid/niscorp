import type { ComponentType, FC, ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// Unified Story + LibraryModule contract
//
// Every story in every library shares this shape. Module-specific
// runtime refs (Nova's shell/registry, Cortex's agent config, etc.)
// ride along on the same object as additional fields — each module
// extends Story with its own extras and casts when it needs them
// from inside its own buildInspectorTabs.
//
// Chrome owns:
//   - sidebar projection (reads id/name/description/category/kind)
//   - mounting the demo (renders <story.Demo />)
//   - the Source tab (reads story.source)
//
// Modules own:
//   - any additional inspector tabs they want (buildInspectorTabs)
//   - an optional RuntimeProvider if they need shared context
// ═══════════════════════════════════════════════════════════

export type Story = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: string;
  Demo: FC;
  source: string;
  // Modules are free to attach arbitrary extras for their own
  // inspector tabs to read. Chrome never touches them.
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
  content?: string;          // markdown — rendered via MarkdownPane
  render?: () => ReactNode;  // interactive page (playground, settings)
};

export type LibraryModule = {
  id: string;
  name: string;
  stories: readonly Story[];
  kindOrder: readonly string[];
  kindLabels: Record<string, string>;
  // Extra inspector tabs to show alongside the chrome-provided
  // Source tab. Omit or return [] when the module has nothing to add.
  buildInspectorTabs?: (story: Story) => InspectorTabDef[];
  // Optional shared context. Rendered around the demo + inspector.
  // Most modules don't need this; Cortex uses it for run history.
  RuntimeProvider?: ComponentType<{ children: ReactNode }>;
  docs?: readonly DocPage[];
};
