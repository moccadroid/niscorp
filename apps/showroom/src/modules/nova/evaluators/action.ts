import {
  createComponentRegistry,
  createLayoutStore,
  createShell,
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
import type { ActionStory } from '../story-types';
import { checkExpectation, type ExpectationResult } from '../../../lib/check-expectation';

export const evaluateActionStory = async (
  story: ActionStory,
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
  const shell = createShell({
    canvases: ['main'],
    registry,
    layoutStore,
    actions: { [story.action.id]: story.action },
    ...(story.fetch === undefined ? {} : { fetch: story.fetch }),
    onError: () => {},
  });
  try {
    const instanceId = shell.push('main', story.action.id);
    // Let mount lifecycle microtasks settle.
    await Promise.resolve();
    await Promise.resolve();
    const runtime = shell.getRuntime(instanceId);
    if (runtime === undefined) return { ok: false, reasons: ['no runtime'] };
    const tree: RenderNode[] = runtime.render();
    return checkExpectation(tree, story.expected);
  } finally {
    shell.dispose();
  }
};
