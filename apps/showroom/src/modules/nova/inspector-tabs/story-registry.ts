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

// Resolve the component registry the inspector should introspect for
// a given story. Shell stories own one on the Shell itself; layout
// stories get a fresh one built from the Nova React builtins plus any
// extras the demo exposed via `story.components`.
export const getStoryRegistry = (story: NovaStory): ComponentRegistry<NovaComponent> => {
  if (story.shell !== undefined) {
    return story.shell.registry as ComponentRegistry<NovaComponent>;
  }
  const registry = createComponentRegistry<NovaComponent>();
  registerNovaReactComponents(registry);
  if (story.components !== undefined) registry.registerAll(story.components);
  return registry;
};

// Resolve the layout store to use when rendering a static (layout
// kind) story. Defaults to a fresh empty store — layouts that use
// `{ ref: '...' }` must export their own pre-populated store.
export const getStoryLayoutStore = (story: NovaStory): LayoutStore =>
  story.layoutStore ?? createLayoutStore();

// Render the current layout-kind story's node tree. Returns an empty
// array for shell stories (which have no static layout to render).
export const renderStaticStory = (story: NovaStory): RenderNode[] => {
  if (story.layout === undefined) return [];
  const registry = getStoryRegistry(story);
  const store = getStoryLayoutStore(story);
  const layout = typeof story.layout === 'string' ? store.get(story.layout) : story.layout;
  if (layout === undefined) return [];
  return renderLayout(layout, story.data ?? {}, { store, registry });
};
