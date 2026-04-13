import type { DocPage, LibraryModule, SidebarStoryEntry } from '../types';
import { isCortexStory } from './story-types';
import { stories } from './stories';
import { Runner } from './runner';
import { CortexRuntimeProvider } from './runtime-context';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';
import { evaluateAll } from './evaluators';

// Documentation lifted from packages/cortex/*.md via Vite raw imports.
// More docs land as the package matures (REFERENCE.md, GUIDE.md, etc.).
import designContent from '../../../../../packages/cortex/DESIGN.md?raw';

const docs: readonly DocPage[] = [{ id: 'design', title: 'Design', content: designContent }];

// Sidebar groups by Cortex feature, not by demo content. The order
// here is the order users see in the sidebar — easiest first.
const KIND_ORDER: readonly string[] = ['standalone', 'tool-use', 'plan-mode', 'rules', 'confirmation'];
const KIND_LABELS: Record<string, string> = {
  standalone: 'STANDALONE EXECUTION',
  'tool-use': 'TOOL USE',
  'plan-mode': 'PLAN MODE (TICK LOOP)',
  rules: 'RULES ENGINE',
  confirmation: 'HUMAN IN THE LOOP',
};

const toSidebarEntry = (story: unknown): SidebarStoryEntry => {
  if (!isCortexStory(story)) {
    return { id: '?', name: '?', description: '', category: '?', kind: '?' };
  }
  return {
    id: story.id,
    name: story.name,
    description: story.description,
    category: story.category,
    kind: story.kind,
  };
};

// Subscribe to localStorage-backed run history changes. The runners
// dispatch a 'cortex:run-history-changed' window event after each
// run completes; the chrome wires this up so the sidebar dots update
// without a manual refresh.
const subscribeStatusChange = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (): void => callback();
  window.addEventListener('cortex:run-history-changed', handler);
  return () => window.removeEventListener('cortex:run-history-changed', handler);
};

export const cortexModule: LibraryModule = {
  id: 'cortex',
  name: 'Cortex',
  stories,
  toSidebarEntry,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  evaluateAll,
  RuntimeProvider: CortexRuntimeProvider,
  Runner,
  buildInspectorTabs,
  docs,
  subscribeStatusChange,
};
