import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type ComponentRegistry,
  type RenderNode,
} from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/react';
import { Stack, Text, Input, Button, Box } from '@niscorp/nova/components/react';
import type { LayoutStory } from '../story-types';
import { checkExpectation, type ExpectationResult } from '../../../lib/check-expectation';

export type LayoutBundle = {
  registry: ComponentRegistry<NovaComponent>;
  nodes: RenderNode[];
  data: Record<string, unknown>;
  expectationResult: ExpectationResult;
};

export const buildLayoutBundle = (story: LayoutStory): LayoutBundle => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ Stack, Text, Input, Button, Box });
  if (story.extraComponents !== undefined) {
    Object.entries(story.extraComponents).forEach(([name, comp]) => {
      registry.register(name, comp);
    });
  }
  const layoutStore = createLayoutStore();
  if (story.preloadLayouts !== undefined) {
    Object.entries(story.preloadLayouts).forEach(([name, node]) => {
      layoutStore.set(name, node);
    });
  }
  const storyData = story.data ?? {};
  const nodes: RenderNode[] = renderLayout(story.layout, storyData, {
    store: layoutStore,
    registry,
    strict: false,
    onError: (err) => {
      console.error(err);
    },
  });
  return {
    registry,
    nodes,
    data: storyData,
    expectationResult: checkExpectation(nodes, story.expected),
  };
};
