import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type ComponentRegistry,
  type LayoutStore,
  type RenderNode,
} from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { registerNovaReactComponents } from '@niscorp/nova/adapters/react/components';
import type { NovaStory } from '@showroom/modules/nova/story-types';

export const getStoryRegistry = (story: NovaStory): ComponentRegistry<NovaComponent> => {
  if (story.shell !== undefined) {
    return story.shell.registry as ComponentRegistry<NovaComponent>;
  }
  const registry = createComponentRegistry<NovaComponent>();
  registerNovaReactComponents(registry);
  if (story.components !== undefined) registry.registerAll(story.components);
  return registry;
};

export const getStoryLayoutStore = (story: NovaStory): LayoutStore =>
  story.layoutStore ?? createLayoutStore();

export const renderStaticStory = (story: NovaStory): RenderNode[] => {
  if (story.layout === undefined) return [];
  const registry = getStoryRegistry(story);
  const store = getStoryLayoutStore(story);
  const layout = typeof story.layout === 'string' ? store.get(story.layout) : story.layout;
  if (layout === undefined) return [];
  return renderLayout(layout, story.data ?? {}, { store, registry });
};
