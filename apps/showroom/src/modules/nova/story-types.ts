import type { LayoutNode, LayoutStore, RegistrationInput, Shell } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { Story as BaseStory } from '@showroom/modules/types';

// Nova extends the chrome Story with runtime refs the module's
// inspector tabs can introspect. Stories export whichever ones
// their demo declares:
//
//   - layout demos  → { layout, data?, components?, layoutStore? }
//   - action + shell demos → { shell }
//
// The inspector-tabs module reads them via the NovaStory cast to
// decide which extra tabs to show (RenderTree / Canvas / Registry)
// and derives any other surfaces from these (e.g. shell.registry).

// `i18n` is a kind rather than a category so the whole area lands in ONE
// sidebar segment: the chrome groups by kind first, and these stories are a
// mix of shell- and layout-driven demos that would otherwise be split across
// two headings by an implementation detail nobody reading them cares about.
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
