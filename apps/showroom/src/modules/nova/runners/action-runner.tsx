import { useEffect, useState, type FC } from 'react';
import {
  createComponentRegistry,
  createLayoutStore,
  createShell,
  type ComponentRegistry,
  type Shell,
} from '@niscorp/nova';
import {
  NovaShellProvider,
  RenderTree,
  useCanvas,
  useActionData,
  useRenderTree,
  useShell,
  type NovaComponent,
} from '@niscorp/nova/react';
import { Stack, Text, Input, Button, Box } from '@niscorp/nova/components/react';
import type { ActionStory } from '../story-types';
import type { RuntimeView } from '../runtime-context';

type Props = {
  story: ActionStory;
  onBundleUpdate: (bundle: RuntimeView | undefined) => void;
};

type Bundle = {
  registry: ComponentRegistry<NovaComponent>;
  shell: Shell;
};

const buildBundle = (story: ActionStory): Bundle => {
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
    onError: (err) => {
      console.error(err);
    },
  });
  return { registry, shell };
};

type ActiveCanvasProps = {
  registry: ComponentRegistry<NovaComponent>;
  onBundleUpdate: (bundle: RuntimeView | undefined) => void;
};

const ActiveCanvas: FC<ActiveCanvasProps> = ({ registry, onBundleUpdate }) => {
  const shell = useShell();
  const canvas = useCanvas('main');
  const instanceId = canvas.active?.id ?? '';
  const data = useActionData(instanceId);
  const tree = useRenderTree(instanceId);
  const runtime = instanceId === '' ? undefined : shell.getRuntime(instanceId);

  useEffect(() => {
    onBundleUpdate({
      data: data ?? {},
      renderTree: tree,
      runtime,
      expectationResult: undefined,
      registry,
    });
  }, [data, tree, runtime, registry, onBundleUpdate]);

  return (
    <div style={{ padding: 24 }}>
      <RenderTree nodes={tree} />
    </div>
  );
};

export const ActionRunner: FC<Props> = ({ story, onBundleUpdate }) => {
  // Build the shell INSIDE the effect so React 18 StrictMode's double-mount
  // gets a fresh shell on the second mount instead of reusing a disposed one.
  const [bundle, setBundle] = useState<Bundle | undefined>(undefined);

  useEffect(() => {
    const next = buildBundle(story);
    next.shell.push('main', story.action.id);
    setBundle(next);
    return () => {
      next.shell.dispose();
      setBundle(undefined);
      onBundleUpdate(undefined);
    };
  }, [story, onBundleUpdate]);

  if (bundle === undefined) return null;

  return (
    <NovaShellProvider shell={bundle.shell} registry={bundle.registry}>
      <ActiveCanvas registry={bundle.registry} onBundleUpdate={onBundleUpdate} />
    </NovaShellProvider>
  );
};
