import type { LayoutNode, LayoutStore, RegistrationInput, Shell } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { Story as BaseStory } from '@showroom/modules/types';

// `i18n` is a kind rather than a category: the chrome groups by kind first,
// and these stories mix shell- and layout-driven demos, which would otherwise
// split across two sidebar headings.
export type NovaStoryKind = 'layout' | 'action' | 'shell' | 'i18n';

export type NovaStory = BaseStory & {
  kind: NovaStoryKind;
  shell?: Shell;
  layout?: LayoutNode | string;
  data?: Record<string, unknown>;
  components?: Record<string, RegistrationInput<NovaComponent>>;
  layoutStore?: LayoutStore;
};

export const isNovaStory = (value: unknown): value is NovaStory => {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v['id'] !== 'string') return false;
  if (typeof v['Demo'] !== 'function') return false;
  return v['kind'] === 'layout' || v['kind'] === 'action' || v['kind'] === 'shell' || v['kind'] === 'i18n';
};
