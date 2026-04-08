import {
  createComponentRegistry,
  createLayoutStore,
  type RenderNode,
} from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/react';
import { Stack, Text, Input, Button, Box } from '@niscorp/nova/components/react';
import type { ShellStory } from '../story-types';
import { checkExpectation, type ExpectationResult } from '../../../lib/check-expectation';

export const evaluateShellStory = async (
  story: ShellStory,
): Promise<ExpectationResult | undefined> => {
  if (story.expected === undefined) return undefined;
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ Stack, Text, Input, Button, Box });
  if (story.extraComponents !== undefined) {
    Object.entries(story.extraComponents).forEach(([name, comp]) => {
      registry.register(name, comp);
    });
  }
  const layoutStore = createLayoutStore();
  const shell = story.shellSetup({ registry, layoutStore });
  try {
    if (story.initialPushes !== undefined) {
      for (const push of story.initialPushes) {
        shell.push(push.canvas, push.actionId, push.input);
      }
    }
    await Promise.resolve();
    await Promise.resolve();
    const state = shell.getState();
    const canvasIds = story.canvases ?? Object.keys(state.canvases);
    const allTrees: RenderNode[] = [];
    for (const canvasId of canvasIds) {
      const canvas = state.canvases[canvasId];
      if (canvas === undefined) continue;
      const activeId = canvas.active?.id;
      if (activeId === undefined) continue;
      const runtime = shell.getRuntime(activeId);
      if (runtime === undefined) continue;
      allTrees.push(...runtime.render());
    }
    return checkExpectation(allTrees, story.expected);
  } finally {
    shell.dispose();
  }
};
