import { useEffect, useState, type FC } from 'react';
import {
  createComponentRegistry,
  createLayoutStore,
  type ComponentRegistry,
  type Shell,
} from '@niscorp/nova';
import {
  NovaShellProvider,
  RenderTree,
  useCanvas,
  useRenderTree,
  useShell,
  useShellState,
  type NovaComponent,
} from '@niscorp/nova/react';
import { Stack, Text, Input, Button, Box } from '@niscorp/nova/components/react';
import type { ShellStory } from '../story-types';
import type { RuntimeView } from '../runtime-context';

type Props = {
  story: ShellStory;
  onBundleUpdate: (bundle: RuntimeView | undefined) => void;
};

type Bundle = {
  registry: ComponentRegistry<NovaComponent>;
  shell: Shell;
  canvasIds: string[];
};

const buildBundle = (story: ShellStory): Bundle => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ Stack, Text, Input, Button, Box });
  if (story.extraComponents !== undefined) {
    Object.entries(story.extraComponents).forEach(([name, comp]) => {
      registry.register(name, comp);
    });
  }
  const layoutStore = createLayoutStore();
  const shell = story.shellSetup({ registry, layoutStore });
  const canvasIds = story.canvases ?? Object.keys(shell.getState().canvases);
  return { registry, shell, canvasIds };
};

type CanvasViewProps = {
  canvasId: string;
};

const CanvasView: FC<CanvasViewProps> = ({ canvasId }) => {
  const canvas = useCanvas(canvasId);
  const activeId = canvas.active?.id ?? '';
  const tree = useRenderTree(activeId);
  return (
    <div style={{ flex: 1, padding: 16, borderRight: '1px solid #e5e7eb' }}>
      <div
        style={{
          fontSize: 11,
          color: '#9ca3af',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        canvas: {canvasId}
      </div>
      {activeId === '' ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>(empty canvas)</div>
      ) : (
        <RenderTree nodes={tree} />
      )}
    </div>
  );
};

type PublisherProps = {
  registry: ComponentRegistry<NovaComponent>;
  canvasIds: string[];
  onBundleUpdate: (bundle: RuntimeView | undefined) => void;
};

const BundlePublisher: FC<PublisherProps> = ({ registry, canvasIds, onBundleUpdate }) => {
  const shell = useShell();
  const state = useShellState();
  useEffect(() => {
    const firstCanvasId = canvasIds[0];
    const firstCanvas = firstCanvasId === undefined ? undefined : state.canvases[firstCanvasId];
    const activeId = firstCanvas?.active?.id;
    const runtime = activeId === undefined ? undefined : shell.getRuntime(activeId);
    onBundleUpdate({
      data: runtime?.getData() ?? {},
      renderTree: runtime?.render() ?? [],
      runtime,
      expectationResult: undefined,
      registry,
      canvasStates: state.canvases,
    });
  }, [shell, state, registry, canvasIds, onBundleUpdate]);
  return null;
};

export const ShellRunner: FC<Props> = ({ story, onBundleUpdate }) => {
  const [bundle, setBundle] = useState<Bundle | undefined>(undefined);

  useEffect(() => {
    const next = buildBundle(story);
    if (story.initialPushes !== undefined) {
      for (const push of story.initialPushes) {
        next.shell.push(push.canvas, push.actionId, push.input);
      }
    }
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
      <BundlePublisher
        registry={bundle.registry}
        canvasIds={bundle.canvasIds}
        onBundleUpdate={onBundleUpdate}
      />
      <div style={{ display: 'flex', height: '100%' }}>
        {bundle.canvasIds.map((id) => (
          <CanvasView key={id} canvasId={id} />
        ))}
      </div>
    </NovaShellProvider>
  );
};
