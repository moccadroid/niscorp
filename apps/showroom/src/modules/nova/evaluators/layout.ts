import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type RenderNode,
} from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/react';
import {
  Stack,
  Text,
  Input,
  Button,
  Box,
} from '@niscorp/nova/components/react';
import type { LayoutStory } from '../story-types';
import { checkExpectation, type ExpectationResult } from '../../../lib/check-expectation';

export type LayoutEvaluation = {
  tree: RenderNode[];
  result: ExpectationResult;
};

export const evaluateLayoutStory = (story: LayoutStory): LayoutEvaluation => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ Stack, Text, Input, Button, Box });
  if (story.extraComponents !== undefined) {
    Object.entries(story.extraComponents).forEach(([name, comp]) => {
      registry.register(name, comp);
    });
  }
  const store = createLayoutStore();
  if (story.preloadLayouts !== undefined) {
    Object.entries(story.preloadLayouts).forEach(([name, node]) => {
      store.set(name, node);
    });
  }
  const tree: RenderNode[] = renderLayout(story.layout, story.data ?? {}, {
    store,
    registry,
    strict: false,
    onError: () => {},
  });
  return { tree, result: checkExpectation(tree, story.expected) };
};
