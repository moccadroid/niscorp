import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { isNovaStory } from '@showroom/modules/nova/story-types';
import { StructureTab } from './structure-tab';
import { DataTab } from './data-tab';
import { RegistryTab } from './registry-tab';

// ═══════════════════════════════════════════════════════════
// Nova inspector tabs — added to the chrome-provided Source tab.
//
//   Structure — the flattened/resolved component tree. For shell
//               and action stories: shell.flattenRenderTree(...)
//               live via onStateChange. For layout stories: the
//               rendered layout against fresh builtins.
//   Data      — live per-canvas active-action data (shell stories
//               and action stories with a shell).
//   Registry  — names of registered components with builtin/custom
//               tag. Always shown.
// ═══════════════════════════════════════════════════════════

export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  if (!isNovaStory(story)) return [];
  const tabs: InspectorTabDef[] = [];

  if (story.shell !== undefined || story.layout !== undefined) {
    tabs.push({ id: 'structure', label: 'Structure', render: () => <StructureTab story={story} /> });
  }
  if (story.shell !== undefined) {
    tabs.push({ id: 'data', label: 'Data', render: () => <DataTab story={story} /> });
  }
  tabs.push({ id: 'registry', label: 'Registry', render: () => <RegistryTab story={story} /> });
  return tabs;
};
